import { Injectable } from "@nestjs/common"
import { clients, invoices, recurringInvoices } from "@workspace/db"
import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf, orderBy, type PageArgs } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type RecurringRow = typeof recurringInvoices.$inferSelect & {
  clientName: string
}
export type RecurringValues = Omit<
  typeof recurringInvoices.$inferInsert,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>

@Injectable()
export class RecurringRepository {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  private scope(): SQL {
    return eq(recurringInvoices.workspaceId, this.ctx.workspaceId)
  }

  private select() {
    return this.db
      .select({ schedule: recurringInvoices, clientName: clients.name })
      .from(recurringInvoices)
      .innerJoin(clients, eq(clients.id, recurringInvoices.clientId))
  }

  async list(
    opts: PageArgs & { status?: RecurringRow["status"]; q?: string }
  ): Promise<{ items: RecurringRow[]; total: number }> {
    const filters: SQL[] = [this.scope()]
    if (opts.status) filters.push(eq(recurringInvoices.status, opts.status))
    if (opts.q) {
      const like = `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      filters.push(
        or(ilike(recurringInvoices.title, like), ilike(clients.name, like))!
      )
    }
    const where = and(...filters)
    const [rows, [counted]] = await Promise.all([
      this.select()
        .where(where)
        .orderBy(
          ...orderBy(
            opts.sort,
            {
              clientName: sql`lower(${clients.name})`,
              nextRunDate: recurringInvoices.nextRunDate,
              createdAt: recurringInvoices.createdAt,
            },
            recurringInvoices.id
          )
        )
        .limit(opts.pageSize)
        .offset(offsetOf(opts.page, opts.pageSize)),
      this.db
        .select({ n: count() })
        .from(recurringInvoices)
        .innerJoin(clients, eq(clients.id, recurringInvoices.clientId))
        .where(where),
    ])
    return {
      items: rows.map((r) => ({ ...r.schedule, clientName: r.clientName })),
      total: counted?.n ?? 0,
    }
  }

  async findById(id: string): Promise<RecurringRow | null> {
    const [row] = await this.select()
      .where(and(this.scope(), eq(recurringInvoices.id, id)))
      .limit(1)
    return row ? { ...row.schedule, clientName: row.clientName } : null
  }

  async create(values: RecurringValues): Promise<string> {
    const [row] = await this.db
      .insert(recurringInvoices)
      .values({ ...values, workspaceId: this.ctx.workspaceId })
      .returning({ id: recurringInvoices.id })
    return row!.id
  }

  async update(id: string, values: Partial<RecurringValues>) {
    await this.db
      .update(recurringInvoices)
      .set(values)
      .where(and(this.scope(), eq(recurringInvoices.id, id)))
  }

  /**
   * Advance only if nobody else did (compare-and-set on nextRunDate), so two
   * workers can never both move a schedule forward.
   */
  async advance(
    id: string,
    fromPeriod: string,
    values: Partial<RecurringValues>
  ): Promise<boolean> {
    const rows = await this.db
      .update(recurringInvoices)
      .set(values)
      .where(
        and(
          this.scope(),
          eq(recurringInvoices.id, id),
          eq(recurringInvoices.nextRunDate, fromPeriod)
        )
      )
      .returning({ id: recurringInvoices.id })
    return rows.length > 0
  }

  async delete(id: string) {
    await this.db
      .delete(recurringInvoices)
      .where(and(this.scope(), eq(recurringInvoices.id, id)))
  }

  async generatedInvoices(id: string) {
    return this.db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        period: invoices.recurringPeriod,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, this.ctx.workspaceId),
          eq(invoices.recurringId, id)
        )
      )
      .orderBy(desc(invoices.recurringPeriod))
      .limit(100)
  }

  /**
   * Worker only (no workspace context): active schedules due by `latestDate`.
   * Callers re-check "due" against each workspace's own timezone.
   */
  async dueAcrossWorkspaces(latestDate: string, limit = 500) {
    return this.db
      .select({
        id: recurringInvoices.id,
        workspaceId: recurringInvoices.workspaceId,
      })
      .from(recurringInvoices)
      .where(
        and(
          eq(recurringInvoices.status, "active"),
          isNotNull(recurringInvoices.nextRunDate),
          lte(recurringInvoices.nextRunDate, latestDate)
        )
      )
      .limit(limit)
  }
}
