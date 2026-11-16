import { BadRequestException, Injectable } from "@nestjs/common"
import type { ProfitLoss } from "@workspace/contracts"
import { expenseCategories, expenses, invoices, payments } from "@workspace/db"
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

const MAX_DAYS = 3 * 366

/**
 * Profit & loss for a date range: income (payments received minus refunds
 * made) against expenses, per month and currency; expenses by category;
 * and tax on issued invoices against tax paid on expenses. No currency
 * conversion: every figure is per currency.
 */
@Injectable()
export class ProfitLossService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  async report(from: string, to: string): Promise<ProfitLoss> {
    if (from > to)
      throw new BadRequestException("`from` must be on or before `to`")
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS)
      throw new BadRequestException("Reports cover at most three years")
    const ws = this.ctx.workspaceId
    const month = (col: unknown) => sql<string>`to_char(${col}, 'YYYY-MM')`

    const [paid, refunded, spent, byCategory, collected, taxPaid] =
      await Promise.all([
        this.db
          .select({
            month: month(payments.paidOn),
            currency: payments.currency,
            amount: sql<string>`sum(${payments.amount})`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.workspaceId, ws),
              gte(payments.paidOn, from),
              lte(payments.paidOn, to)
            )
          )
          .groupBy(sql`1`, payments.currency),
        this.db
          .select({
            month: month(payments.refundedAt),
            currency: payments.currency,
            amount: sql<string>`sum(${payments.amount})`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.workspaceId, ws),
              eq(payments.status, "refunded"),
              sql`${payments.refundedAt}::date between ${from} and ${to}`
            )
          )
          .groupBy(sql`1`, payments.currency),
        this.db
          .select({
            month: month(expenses.spentOn),
            currency: expenses.currency,
            amount: sql<string>`sum(${expenses.amount})`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.workspaceId, ws),
              gte(expenses.spentOn, from),
              lte(expenses.spentOn, to)
            )
          )
          .groupBy(sql`1`, expenses.currency),
        this.db
          .select({
            categoryId: expenses.categoryId,
            name: expenseCategories.name,
            currency: expenses.currency,
            amount: sql<string>`sum(${expenses.amount})`,
          })
          .from(expenses)
          .leftJoin(
            expenseCategories,
            eq(expenseCategories.id, expenses.categoryId)
          )
          .where(
            and(
              eq(expenses.workspaceId, ws),
              gte(expenses.spentOn, from),
              lte(expenses.spentOn, to)
            )
          )
          .groupBy(
            expenses.categoryId,
            expenseCategories.name,
            expenses.currency
          ),
        this.db
          .select({
            currency: invoices.currency,
            amount: sql<string>`sum(${invoices.taxTotal})`,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.workspaceId, ws),
              inArray(invoices.status, ["issued"]),
              gte(invoices.issueDate, from),
              lte(invoices.issueDate, to)
            )
          )
          .groupBy(invoices.currency),
        this.db
          .select({
            currency: expenses.currency,
            amount: sql<string>`sum(${expenses.taxAmount})`,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.workspaceId, ws),
              gte(expenses.spentOn, from),
              lte(expenses.spentOn, to)
            )
          )
          .groupBy(expenses.currency),
      ])

    type Cell = { income: number; expenses: number }
    const cells = new Map<string, Cell>()
    const cell = (m: string, c: string) => {
      const k = `${m}|${c}`
      const v = cells.get(k) ?? { income: 0, expenses: 0 }
      cells.set(k, v)
      return v
    }
    for (const r of paid) cell(r.month, r.currency).income += Number(r.amount)
    for (const r of refunded)
      cell(r.month, r.currency).income -= Number(r.amount)
    for (const r of spent)
      cell(r.month, r.currency).expenses += Number(r.amount)

    const months = [...cells.entries()]
      .map(([k, v]) => {
        const [m, currency] = k.split("|") as [string, string]
        return {
          month: m,
          currency,
          income: v.income,
          expenses: v.expenses,
          profit: v.income - v.expenses,
        }
      })
      .sort(
        (a, b) =>
          a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)
      )

    const totalsBy = new Map<string, Cell>()
    for (const m of months) {
      const t = totalsBy.get(m.currency) ?? { income: 0, expenses: 0 }
      t.income += m.income
      t.expenses += m.expenses
      totalsBy.set(m.currency, t)
    }
    const taxBy = new Map<string, { collected: number; paid: number }>()
    for (const r of collected)
      taxBy.set(r.currency, {
        collected: Number(r.amount),
        paid: taxBy.get(r.currency)?.paid ?? 0,
      })
    for (const r of taxPaid)
      taxBy.set(r.currency, {
        collected: taxBy.get(r.currency)?.collected ?? 0,
        paid: Number(r.amount),
      })

    return {
      from,
      to,
      months,
      totals: [...totalsBy.entries()].map(([currency, t]) => ({
        currency,
        income: t.income,
        expenses: t.expenses,
        amount: t.income - t.expenses,
      })),
      byCategory: byCategory
        .map((r) => ({
          categoryId: r.categoryId,
          name: r.name ?? "Uncategorized",
          currency: r.currency,
          amount: Number(r.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
      tax: [...taxBy.entries()]
        .filter(([, t]) => t.collected || t.paid)
        .map(([currency, t]) => ({ currency, ...t })),
    }
  }
}
