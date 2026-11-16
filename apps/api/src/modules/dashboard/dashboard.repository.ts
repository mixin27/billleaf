import { Injectable } from "@nestjs/common"
import { clients, invoices, payments, quotes, receipts } from "@workspace/db"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

const n = (v: unknown) => Number(v ?? 0)

/** Aggregate queries for the dashboard. Every query is workspace-scoped. */
@Injectable()
export class DashboardRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  private get ws() {
    return this.ctx.workspaceId
  }

  /** Issued, not fully paid invoices. */
  private unpaid() {
    return and(
      eq(invoices.workspaceId, this.ws),
      eq(invoices.status, "issued"),
      sql`${invoices.amountPaid} + ${invoices.amountCredited} < ${invoices.total}`
    )!
  }

  async receivableTotals(today: string) {
    const due = sql`${invoices.total} - ${invoices.amountPaid} - ${invoices.amountCredited}`
    const late = sql`${invoices.dueDate} < ${today}::date`
    const rows = await this.db
      .select({
        currency: invoices.currency,
        outstanding: sql<string>`sum(${due})`,
        overdue: sql<string>`coalesce(sum(${due}) filter (where ${late}), 0)`,
        openCount: count(),
        overdueCount: sql<string>`count(*) filter (where ${late})`,
      })
      .from(invoices)
      .where(this.unpaid())
      .groupBy(invoices.currency)
    return rows.map((r) => ({
      currency: r.currency,
      outstanding: n(r.outstanding),
      overdue: n(r.overdue),
      openCount: n(r.openCount),
      overdueCount: n(r.overdueCount),
    }))
  }

  async aging(today: string) {
    const due = sql`${invoices.total} - ${invoices.amountPaid} - ${invoices.amountCredited}`
    const days = sql`(${today}::date - ${invoices.dueDate})`
    const bucket = sql<string>`case
      when ${invoices.dueDate} is null or ${days} <= 0 then 'current'
      when ${days} <= 30 then '1_30'
      when ${days} <= 60 then '31_60'
      when ${days} <= 90 then '61_90'
      else '90_plus' end`
    const rows = await this.db
      .select({
        currency: invoices.currency,
        bucket,
        amount: sql<string>`sum(${due})`,
      })
      .from(invoices)
      .where(this.unpaid())
      // By position: the bucket expression carries bound params, so Postgres
      // wouldn't match a repeated expression ($1 vs $7) in GROUP BY.
      .groupBy(sql`1`, sql`2`)
    return rows.map((r) => ({
      currency: r.currency,
      bucket: r.bucket,
      amount: n(r.amount),
    }))
  }

  async draftInvoiceCount() {
    const [row] = await this.db
      .select({ n: count() })
      .from(invoices)
      .where(
        and(eq(invoices.workspaceId, this.ws), eq(invoices.status, "draft"))
      )
    return n(row?.n)
  }

  async overdueInvoices(today: string, limit = 5) {
    return this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        clientName: clients.name,
        currency: invoices.currency,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        amountCredited: invoices.amountCredited,
        dueDate: invoices.dueDate,
        daysOverdue: sql<string>`${today}::date - ${invoices.dueDate}`,
      })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(this.unpaid(), lt(invoices.dueDate, today)))
      .orderBy(asc(invoices.dueDate))
      .limit(limit)
  }

  /** Completed payments received within [from, to] (inclusive), by currency. */
  async receivedBetween(from: string, to: string) {
    const rows = await this.db
      .select({
        currency: payments.currency,
        amount: sql<string>`sum(${payments.amount})`,
        count: count(),
      })
      .from(payments)
      .where(
        and(
          eq(payments.workspaceId, this.ws),
          eq(payments.status, "completed"),
          gte(payments.paidOn, from),
          lte(payments.paidOn, to)
        )
      )
      .groupBy(payments.currency)
    return rows.map((r) => ({
      currency: r.currency,
      amount: n(r.amount),
      count: n(r.count),
    }))
  }

  async receivedByMonth(from: string, to: string) {
    const month = sql<string>`to_char(${payments.paidOn}, 'YYYY-MM')`
    const rows = await this.db
      .select({
        currency: payments.currency,
        month,
        amount: sql<string>`sum(${payments.amount})`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.workspaceId, this.ws),
          eq(payments.status, "completed"),
          gte(payments.paidOn, from),
          lte(payments.paidOn, to)
        )
      )
      .groupBy(payments.currency, month)
    return rows.map((r) => ({
      currency: r.currency,
      month: r.month,
      amount: n(r.amount),
    }))
  }

  async recentPayments(limit = 5) {
    return this.db
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.number,
        receiptNumber: receipts.number,
        clientName: clients.name,
        amount: payments.amount,
        currency: payments.currency,
        paidOn: payments.paidOn,
        method: payments.method,
      })
      .from(payments)
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .leftJoin(receipts, eq(receipts.paymentId, payments.id))
      .where(
        and(eq(payments.workspaceId, this.ws), eq(payments.status, "completed"))
      )
      .orderBy(desc(payments.paidOn), desc(payments.id))
      .limit(limit)
  }

  /** Sent quotes that haven't expired, by currency. */
  async openQuotes(today: string) {
    const rows = await this.db
      .select({
        currency: quotes.currency,
        amount: sql<string>`sum(${quotes.total})`,
        count: count(),
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.workspaceId, this.ws),
          eq(quotes.status, "sent"),
          or(isNull(quotes.validUntil), gte(quotes.validUntil, today))
        )
      )
      .groupBy(quotes.currency)
    return rows.map((r) => ({
      currency: r.currency,
      amount: n(r.amount),
      count: n(r.count),
    }))
  }

  async acceptedQuotesSince(from: Date) {
    const rows = await this.db
      .select({
        currency: quotes.currency,
        amount: sql<string>`sum(${quotes.total})`,
        count: count(),
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.workspaceId, this.ws),
          eq(quotes.status, "accepted"),
          gte(quotes.acceptedAt, from)
        )
      )
      .groupBy(quotes.currency)
    return rows.map((r) => ({
      currency: r.currency,
      amount: n(r.amount),
      count: n(r.count),
    }))
  }

  async quotesExpiringBetween(from: string, to: string) {
    const [row] = await this.db
      .select({ n: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.workspaceId, this.ws),
          eq(quotes.status, "sent"),
          gte(quotes.validUntil, from),
          lte(quotes.validUntil, to)
        )
      )
    return n(row?.n)
  }
}
