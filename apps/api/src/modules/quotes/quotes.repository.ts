import { Injectable } from "@nestjs/common"
import {
  clients,
  invoices,
  quoteLines,
  quotes,
  type Transaction,
} from "@workspace/db"
import { and, asc, count, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type QuoteRow = typeof quotes.$inferSelect
export type QuoteLineRow = typeof quoteLines.$inferSelect
export type QuoteWithClient = QuoteRow & {
  clientName: string
  /** Present on detail lookups once converted to an invoice. */
  invoiceId?: string | null
  invoiceNumber?: string | null
}
export type QuoteValues = Omit<
  typeof quotes.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>
export type LineValues = Omit<
  typeof quoteLines.$inferInsert,
  "id" | "workspaceId" | "quoteId"
>

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

@Injectable()
export class QuotesRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get database() {
    return this.db
  }

  private scope(): SQL {
    return eq(quotes.workspaceId, this.ctx.workspaceId)
  }

  async list(opts: {
    status?: QuoteRow["status"]
    clientId?: string
    q?: string
    cursor?: string
    limit: number
  }): Promise<{ items: QuoteWithClient[]; nextCursor: string | null }> {
    const filters: SQL[] = [this.scope()]
    if (opts.status) filters.push(eq(quotes.status, opts.status))
    if (opts.clientId) filters.push(eq(quotes.clientId, opts.clientId))
    if (opts.q) {
      const like = `%${escapeLike(opts.q)}%`
      filters.push(
        or(
          ilike(quotes.number, like),
          ilike(quotes.title, like),
          ilike(clients.name, like)
        )!
      )
    }
    if (opts.cursor) filters.push(lt(quotes.id, opts.cursor))
    const rows = await this.db
      .select({ quote: quotes, clientName: clients.name })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .where(and(...filters))
      .orderBy(desc(quotes.id))
      .limit(opts.limit + 1)
    const items = rows
      .slice(0, opts.limit)
      .map((r) => ({ ...r.quote, clientName: r.clientName }))
    return {
      items,
      nextCursor: rows.length > opts.limit ? items[items.length - 1]!.id : null,
    }
  }

  async findById(
    id: string,
    tx: Database | Transaction = this.db,
    opts: { forUpdate?: boolean } = {}
  ): Promise<QuoteWithClient | null> {
    const q = tx
      .select({
        quote: quotes,
        clientName: clients.name,
        invoiceId: invoices.id,
        invoiceNumber: invoices.number,
      })
      .from(quotes)
      .innerJoin(clients, eq(clients.id, quotes.clientId))
      .leftJoin(invoices, eq(invoices.quoteId, quotes.id))
      .where(and(this.scope(), eq(quotes.id, id)))
      .limit(1)
    const [row] = opts.forUpdate
      ? await q.for("update", { of: quotes })
      : await q
    return row
      ? {
          ...row.quote,
          clientName: row.clientName,
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
        }
      : null
  }

  async lines(
    quoteId: string,
    tx: Database | Transaction = this.db
  ): Promise<QuoteLineRow[]> {
    return tx
      .select()
      .from(quoteLines)
      .where(
        and(
          eq(quoteLines.workspaceId, this.ctx.workspaceId),
          eq(quoteLines.quoteId, quoteId)
        )
      )
      .orderBy(asc(quoteLines.position))
  }

  async create(values: QuoteValues, lines: LineValues[]): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quotes)
        .values({ ...values, workspaceId: this.ctx.workspaceId })
        .returning({ id: quotes.id })
      await this.insertLines(tx, row!.id, lines)
      return row!.id
    })
  }

  async update(
    tx: Transaction,
    id: string,
    values: Partial<QuoteValues>,
    lines?: LineValues[]
  ): Promise<void> {
    if (Object.keys(values).length > 0) {
      await tx
        .update(quotes)
        .set(values)
        .where(and(this.scope(), eq(quotes.id, id)))
    }
    if (lines) {
      await tx
        .delete(quoteLines)
        .where(
          and(
            eq(quoteLines.workspaceId, this.ctx.workspaceId),
            eq(quoteLines.quoteId, id)
          )
        )
      await this.insertLines(tx, id, lines)
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(quotes).where(and(this.scope(), eq(quotes.id, id)))
  }

  async countForClient(clientId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(quotes)
      .where(and(this.scope(), eq(quotes.clientId, clientId)))
    return row?.n ?? 0
  }

  private async insertLines(
    tx: Transaction,
    quoteId: string,
    lines: LineValues[]
  ) {
    if (lines.length === 0) return
    await tx
      .insert(quoteLines)
      .values(
        lines.map((l) => ({ ...l, quoteId, workspaceId: this.ctx.workspaceId }))
      )
  }
}
