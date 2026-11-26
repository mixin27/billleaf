import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type CashbookRole,
  cashbookRoleAtLeast,
  OPERATOR_EDIT_WINDOW_HOURS,
} from "@workspace/contracts"
import { cashbookMembers, cashbooks } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"

export type CashbookRow = typeof cashbooks.$inferSelect

const ACTIONS: Record<Exclude<CashbookRole, "viewer">, string> = {
  operator: "add entries to",
  admin: "change entries or settings of",
  owner: "manage members of or delete",
}

/**
 * Who can do what in a cashbook (ADR-0019). The only place that reads
 * `cashbook_members`. Members with `cashbook.manage` act as owners of every
 * book. A book you have no role in is a 404, so its existence isn't leaked.
 */
@Injectable()
export class CashbookAccess {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext
  ) {}

  get managesAll(): boolean {
    return this.ctx.permissions.has("cashbook.manage")
  }

  /** The book and your role in it, or 404. */
  async book(
    bookId: string,
    tx: Database = this.db
  ): Promise<{ book: CashbookRow; role: CashbookRole }> {
    const [row] = await tx
      .select({ book: cashbooks, role: cashbookMembers.role })
      .from(cashbooks)
      .leftJoin(
        cashbookMembers,
        and(
          eq(cashbookMembers.bookId, cashbooks.id),
          eq(cashbookMembers.memberId, this.ctx.memberId)
        )
      )
      .where(
        and(
          eq(cashbooks.workspaceId, this.ctx.workspaceId),
          eq(cashbooks.id, bookId)
        )
      )
      .limit(1)
    const role: CashbookRole | null = this.managesAll
      ? "owner"
      : (row?.role ?? null)
    if (!row || !role) throw new NotFoundException("Cashbook not found")
    return { book: row.book, role }
  }

  /** The book, if your role is at least `min`; 403 otherwise. */
  async require(
    bookId: string,
    min: CashbookRole,
    tx?: Database
  ): Promise<{ book: CashbookRow; role: CashbookRole }> {
    const found = await this.book(bookId, tx)
    if (!cashbookRoleAtLeast(found.role, min))
      throw new ForbiddenException({
        message:
          min === "viewer"
            ? "You can't open this cashbook"
            : `Your role can't ${ACTIONS[min]} this cashbook`,
        code: "cashbook_role",
      })
    return found
  }

  /**
   * Whether you can change an entry: admins and owners any entry,
   * operators their own for a while after adding it.
   */
  canEditEntry(
    role: CashbookRole,
    entry: { createdByMemberId: string | null; createdAt: Date },
    now = new Date()
  ): boolean {
    if (cashbookRoleAtLeast(role, "admin")) return true
    if (role !== "operator") return false
    return (
      entry.createdByMemberId === this.ctx.memberId &&
      now.getTime() - entry.createdAt.getTime() <
        OPERATOR_EDIT_WINDOW_HOURS * 3_600_000
    )
  }

  assertCanEditEntry(
    role: CashbookRole,
    entry: { createdByMemberId: string | null; createdAt: Date }
  ) {
    if (!this.canEditEntry(role, entry))
      throw new ForbiddenException({
        message:
          role === "operator"
            ? `You can change your own entries for ${OPERATOR_EDIT_WINDOW_HOURS} hours after adding them`
            : "Your role can't change entries in this cashbook",
        code: "cashbook_role",
      })
  }
}
