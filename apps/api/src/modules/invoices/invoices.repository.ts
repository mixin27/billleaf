import { Injectable } from "@nestjs/common"
import type { InvoiceDisplayStatus } from "@workspace/contracts"
import {
  clients,
  invoiceLines,
  invoices,
  quotes,
  type Transaction,
} from "@workspace/db"
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import type { StoredLine } from "../documents/line-values.js"

export type InvoiceRow = typeof invoices.$inferSelect
export type InvoiceLineRow = typeof invoiceLines.$inferSelect
export type InvoiceWithRefs = InvoiceRow & {
  clientName: string
  quoteNumber?: string | null
}
export type InvoiceValues = Omit<
  typeof invoices.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

@Injectable()
export class InvoicesRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get database() {
    return this.db
  }

  private scope(): SQL {
    return eq(invoices.workspaceId, this.ctx.workspaceId)
  }

  /** SQL equivalent of invoiceState().displayStatus. */
  private statusFilter(status: InvoiceDisplayStatus, today: string): SQL {
    const issued = eq(invoices.status, "issued")
    const late = and(
      lt(invoices.dueDate, today),
      lt(invoices.amountPaid, invoices.total)
    )!
    const notLate = or(isNull(invoices.dueDate), gte(invoices.dueDate, today))!
    switch (status) {
      case "draft":
      case "void":
        return eq(invoices.status, status)
      case "paid":
        return and(issued, gte(invoices.amountPaid, invoices.total))!
      case "overdue":
        return and(issued, late)!
      case "partially_paid":
        return and(
          issued,
          gt(invoices.amountPaid, 0),
          lt(invoices.amountPaid, invoices.total),
          notLate
        )!
      case "open":
        return and(
          issued,
          eq(invoices.amountPaid, 0),
          sql`${invoices.total} > 0`,
          notLate
        )!
    }
  }

  async list(opts: {
    status?: InvoiceDisplayStatus
    clientId?: string
    q?: string
    cursor?: string
    limit: number
    today: string
  }): Promise<{ items: InvoiceWithRefs[]; nextCursor: string | null }> {
    const filters: SQL[] = [this.scope()]
    if (opts.status) filters.push(this.statusFilter(opts.status, opts.today))
    if (opts.clientId) filters.push(eq(invoices.clientId, opts.clientId))
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(
        or(
          ilike(invoices.number, like),
          ilike(invoices.title, like),
          ilike(clients.name, like)
        )!
      )
    }
    if (opts.cursor) filters.push(lt(invoices.id, opts.cursor))
    const rows = await this.db
      .select({ invoice: invoices, clientName: clients.name })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(...filters))
      .orderBy(desc(invoices.id))
      .limit(opts.limit + 1)
    const items = rows
      .slice(0, opts.limit)
      .map((r) => ({ ...r.invoice, clientName: r.clientName }))
    return {
      items,
      nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null,
    }
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db,
    opts: { forUpdate?: boolean } = {}
  ): Promise<InvoiceWithRefs | null> {
    const q = tx
      .select({
        invoice: invoices,
        clientName: clients.name,
        quoteNumber: quotes.number,
      })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .leftJoin(quotes, eq(quotes.id, invoices.quoteId))
      .where(and(this.scope(), eq(invoices.id, id)))
      .limit(1)
    const [row] = opts.forUpdate
      ? await q.for("update", { of: invoices })
      : await q
    return row
      ? {
          ...row.invoice,
          clientName: row.clientName,
          quoteNumber: row.quoteNumber,
        }
      : null
  }

  async findByQuote(quoteId: string): Promise<InvoiceRow | null> {
    const [row] = await this.db
      .select()
      .from(invoices)
      .where(and(this.scope(), eq(invoices.quoteId, quoteId)))
      .limit(1)
    return row ?? null
  }

  async lines(
    invoiceId: string,
    tx: Database | Transaction = this.db
  ): Promise<InvoiceLineRow[]> {
    return tx
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.workspaceId, this.ctx.workspaceId),
          eq(invoiceLines.invoiceId, invoiceId)
        )
      )
      .orderBy(asc(invoiceLines.position))
  }

  async create(values: InvoiceValues, lines: StoredLine[]): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(invoices)
        .values({ ...values, workspaceId: this.ctx.workspaceId })
        .returning({ id: invoices.id })
      await this.insertLines(tx, row!.id, lines)
      return row!.id
    })
  }

  async update(
    tx: Database | Transaction,
    id: string,
    values: Partial<InvoiceValues>,
    lines?: StoredLine[]
  ): Promise<void> {
    if (Object.keys(values).length > 0) {
      await tx
        .update(invoices)
        .set(values)
        .where(and(this.scope(), eq(invoices.id, id)))
    }
    if (lines) {
      await tx
        .delete(invoiceLines)
        .where(
          and(
            eq(invoiceLines.workspaceId, this.ctx.workspaceId),
            eq(invoiceLines.invoiceId, id)
          )
        )
      await this.insertLines(tx as Transaction, id, lines)
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(invoices).where(and(this.scope(), eq(invoices.id, id)))
  }

  private async insertLines(
    tx: Transaction | Database,
    invoiceId: string,
    lines: StoredLine[]
  ) {
    if (lines.length === 0) return
    await tx
      .insert(invoiceLines)
      .values(
        lines.map((l) => ({
          ...l,
          invoiceId,
          workspaceId: this.ctx.workspaceId,
        }))
      )
  }
}
