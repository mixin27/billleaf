import { Injectable } from "@nestjs/common"
import { cashbooks, clients, files, invoices, member } from "@workspace/db"
import { and, count, eq, gte, isNotNull, isNull, sum } from "drizzle-orm"

import { RequestContext } from "../common/context/request-context.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { todayIn } from "../modules/documents/party-snapshot.js"
import type { LimitKey } from "./plans.js"

/** Current consumption of each plan limit for the active workspace. */
@Injectable()
export class UsageService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  async members(): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(member)
      .where(eq(member.organizationId, this.ctx.workspaceId))
    return r?.n ?? 0
  }

  async clients(): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, this.ctx.workspaceId),
          isNull(clients.archivedAt)
        )
      )
    return r?.n ?? 0
  }

  /** Invoices issued (numbered) with an issue date in the current month. */
  async invoicesPerMonth(timeZone: string): Promise<number> {
    const monthStart = `${todayIn(timeZone).slice(0, 7)}-01`
    const [r] = await this.db
      .select({ n: count() })
      .from(invoices)
      .where(
        and(
          eq(invoices.workspaceId, this.ctx.workspaceId),
          isNotNull(invoices.number),
          gte(invoices.issueDate, monthStart)
        )
      )
    return r?.n ?? 0
  }

  /** Stored file size in MB (rounded up to 0.1). */
  async storageMb(): Promise<number> {
    const [r] = await this.db
      .select({ bytes: sum(files.size) })
      .from(files)
      .where(eq(files.workspaceId, this.ctx.workspaceId))
    return Math.ceil((Number(r?.bytes ?? 0) / 1_048_576) * 10) / 10
  }

  /** Active (not archived) cashbooks. */
  async cashbooks(): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(cashbooks)
      .where(
        and(
          eq(cashbooks.workspaceId, this.ctx.workspaceId),
          isNull(cashbooks.archivedAt)
        )
      )
    return r?.n ?? 0
  }

  async all(timeZone: string): Promise<Record<LimitKey, number>> {
    const [members, clientsN, invoicesN, storage, books] = await Promise.all([
      this.members(),
      this.clients(),
      this.invoicesPerMonth(timeZone),
      this.storageMb(),
      this.cashbooks(),
    ])
    return {
      members,
      clients: clientsN,
      invoicesPerMonth: invoicesN,
      storageMb: storage,
      cashbooks: books,
    }
  }
}
