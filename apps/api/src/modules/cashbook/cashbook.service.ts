import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  type AddCashbookMemberInput,
  type Cashbook,
  type CashbookFields,
  type CashbookMember,
  type CashbookOption,
  type CashbookRole,
  type CreateCashbookInput,
  DEFAULT_CASHBOOK_MODES,
  type SaveCashbookOptionInput,
  type UpdateCashbookInput,
} from "@workspace/contracts"
import {
  cashbookCategories,
  cashbookEntries,
  cashbookEntryFiles,
  cashbookMembers,
  cashbookModes,
  cashbooks,
  member,
  user,
} from "@workspace/db"
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { EntitlementsService } from "../../billing/entitlements.service.js"
import { UsageService } from "../../billing/usage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { FilesService } from "../files/files.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { CashbookAccess, type CashbookRow } from "./cashbook-access.service.js"

const DEFAULT_FIELDS: CashbookFields = {
  contact: true,
  category: true,
  mode: true,
}

/** Signed amount: + for money in, − for money out. */
export const signed = sql<number>`case when ${cashbookEntries.type} = 'in' then ${cashbookEntries.amount} else -${cashbookEntries.amount} end`

const isUniqueViolation = (e: unknown) =>
  (e as { cause?: { code?: string } }).cause?.code === "23505"

type OptionTable = typeof cashbookCategories | typeof cashbookModes

/** Books, their members, categories and payment modes (ADR-0019). */
@Injectable()
export class CashbookService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly access: CashbookAccess,
    private readonly profile: WorkspaceProfileService,
    private readonly entitlements: EntitlementsService,
    private readonly usage: UsageService,
    private readonly files: FilesService,
    private readonly audit: AuditService
  ) {}

  // ── Books ──────────────────────────────────────────────────────────────

  /** Books you can open, with balances; archived ones on request. */
  async list(opts: { archived: boolean }): Promise<Cashbook[]> {
    const ws = this.ctx.workspaceId
    const mine = this.db
      .select({ bookId: cashbookMembers.bookId, role: cashbookMembers.role })
      .from(cashbookMembers)
      .where(eq(cashbookMembers.memberId, this.ctx.memberId))
      .as("mine")
    const rows = await this.db
      .select({ book: cashbooks, role: mine.role })
      .from(cashbooks)
      .leftJoin(mine, eq(mine.bookId, cashbooks.id))
      .where(
        and(
          eq(cashbooks.workspaceId, ws),
          opts.archived
            ? isNotNull(cashbooks.archivedAt)
            : isNull(cashbooks.archivedAt),
          this.access.managesAll ? undefined : isNotNull(mine.role)
        )
      )
    const books = await this.withStats(
      rows.map((r) => ({
        book: r.book,
        role: this.access.managesAll ? "owner" : r.role!,
      }))
    )
    // Most recently used first, like the CashBook app.
    return books.sort((a, b) =>
      (b.lastActivityAt ?? b.createdAt).localeCompare(
        a.lastActivityAt ?? a.createdAt
      )
    )
  }

  async get(bookId: string): Promise<Cashbook> {
    const found = await this.access.book(bookId)
    const [book] = await this.withStats([found])
    return book!
  }

  async create(input: CreateCashbookInput): Promise<Cashbook> {
    await this.entitlements.assertWithinLimit(
      "cashbooks",
      await this.usage.cashbooks()
    )
    const profile = await this.profile.get()
    const id = await this.db.transaction(async (tx) => {
      const [book] = await tx
        .insert(cashbooks)
        .values({
          workspaceId: this.ctx.workspaceId,
          name: input.name,
          currency: input.currency ?? profile.defaultCurrency,
          fields: { ...DEFAULT_FIELDS, ...input.fields },
          createdByMemberId: this.ctx.memberId,
        })
        .returning({ id: cashbooks.id })
      await tx.insert(cashbookMembers).values({
        workspaceId: this.ctx.workspaceId,
        bookId: book!.id,
        memberId: this.ctx.memberId,
        role: "owner",
      })
      await tx.insert(cashbookModes).values(
        DEFAULT_CASHBOOK_MODES.map((name) => ({
          workspaceId: this.ctx.workspaceId,
          bookId: book!.id,
          name,
        }))
      )
      return book!.id
    })
    await this.audit.record("cashbook.created", {
      resourceType: "cashbook",
      resourceId: id,
      metadata: { name: input.name },
    })
    return this.get(id)
  }

  async update(bookId: string, input: UpdateCashbookInput): Promise<Cashbook> {
    const ownerOnly =
      input.currency !== undefined || input.archived !== undefined
    const { book } = await this.access.require(
      bookId,
      ownerOnly ? "owner" : "admin"
    )
    const values: Partial<typeof cashbooks.$inferInsert> = {}
    if (input.name !== undefined) values.name = input.name
    if (input.fields) values.fields = { ...book.fields, ...input.fields }
    if (input.currency !== undefined && input.currency !== book.currency) {
      if (await this.hasEntries(bookId))
        throw new ConflictException({
          message:
            "This book already has entries, so its currency can't change. Start a new book instead.",
          code: "cashbook_has_entries",
        })
      values.currency = input.currency
    }
    if (input.archived !== undefined) {
      if (!input.archived && book.archivedAt)
        await this.entitlements.assertWithinLimit(
          "cashbooks",
          await this.usage.cashbooks()
        )
      values.archivedAt = input.archived
        ? (book.archivedAt ?? new Date())
        : null
    }
    if (Object.keys(values).length)
      await this.db.update(cashbooks).set(values).where(this.bookScope(bookId))
    await this.audit.record("cashbook.updated", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: { ...input },
    })
    return this.get(bookId)
  }

  /** Deletes the book with its entries and attachments. Owners only. */
  async remove(bookId: string): Promise<void> {
    const { book } = await this.access.require(bookId, "owner")
    const attachments = await this.db
      .select({ fileId: cashbookEntryFiles.fileId })
      .from(cashbookEntryFiles)
      .innerJoin(
        cashbookEntries,
        eq(cashbookEntries.id, cashbookEntryFiles.entryId)
      )
      .where(eq(cashbookEntries.bookId, bookId))
    await this.db.delete(cashbooks).where(this.bookScope(bookId))
    for (const a of attachments) await this.files.remove(a.fileId)
    await this.audit.record("cashbook.deleted", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: { name: book.name },
    })
  }

  // ── Members ────────────────────────────────────────────────────────────

  async members(bookId: string): Promise<CashbookMember[]> {
    await this.access.book(bookId)
    const rows = await this.db
      .select({
        memberId: cashbookMembers.memberId,
        role: cashbookMembers.role,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(cashbookMembers)
      .innerJoin(member, eq(member.id, cashbookMembers.memberId))
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(cashbookMembers.bookId, bookId))
      .orderBy(
        sql`case ${cashbookMembers.role} when 'owner' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end`,
        asc(user.name)
      )
    return rows
  }

  async addMember(
    bookId: string,
    input: AddCashbookMemberInput
  ): Promise<CashbookMember[]> {
    await this.access.require(bookId, "owner")
    const [m] = await this.db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.id, input.memberId),
          eq(member.organizationId, this.ctx.workspaceId)
        )
      )
    if (!m) throw new NotFoundException("That person isn't in this workspace")
    try {
      await this.db.insert(cashbookMembers).values({
        workspaceId: this.ctx.workspaceId,
        bookId,
        memberId: input.memberId,
        role: input.role,
      })
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          message: "Already a member of this book. Change their role instead.",
          code: "cashbook_member_exists",
        })
      throw e
    }
    await this.audit.record("cashbook.member_added", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: { memberId: input.memberId, role: input.role },
    })
    return this.members(bookId)
  }

  async setMemberRole(
    bookId: string,
    memberId: string,
    role: CashbookRole
  ): Promise<CashbookMember[]> {
    await this.access.require(bookId, "owner")
    const current = await this.memberRole(bookId, memberId)
    if (current === "owner" && role !== "owner")
      await this.assertAnotherOwner(bookId, memberId)
    await this.db
      .update(cashbookMembers)
      .set({ role })
      .where(
        and(
          eq(cashbookMembers.bookId, bookId),
          eq(cashbookMembers.memberId, memberId)
        )
      )
    await this.audit.record("cashbook.member_role_changed", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: { memberId, from: current, to: role },
    })
    return this.members(bookId)
  }

  /** Owners remove anyone; everyone can leave a book themselves. */
  async removeMember(bookId: string, memberId: string): Promise<void> {
    if (memberId === this.ctx.memberId) await this.access.book(bookId)
    else await this.access.require(bookId, "owner")
    const current = await this.memberRole(bookId, memberId)
    if (current === "owner") await this.assertAnotherOwner(bookId, memberId)
    await this.db
      .delete(cashbookMembers)
      .where(
        and(
          eq(cashbookMembers.bookId, bookId),
          eq(cashbookMembers.memberId, memberId)
        )
      )
    await this.audit.record("cashbook.member_removed", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: { memberId },
    })
  }

  // ── Categories and modes ───────────────────────────────────────────────

  async options(
    kind: "category" | "mode",
    bookId: string
  ): Promise<CashbookOption[]> {
    await this.access.book(bookId)
    const t = table(kind)
    return this.db
      .select({ id: t.id, name: t.name, archived: t.archived })
      .from(t)
      .where(eq(t.bookId, bookId))
      .orderBy(asc(t.archived), asc(sql`lower(${t.name})`))
  }

  async createOption(
    kind: "category" | "mode",
    bookId: string,
    input: SaveCashbookOptionInput
  ): Promise<CashbookOption> {
    await this.access.require(bookId, "admin")
    const t = table(kind)
    try {
      const [row] = await this.db
        .insert(t)
        .values({
          workspaceId: this.ctx.workspaceId,
          bookId,
          name: input.name,
          archived: input.archived ?? false,
        })
        .returning({ id: t.id, name: t.name, archived: t.archived })
      return row!
    } catch (e) {
      throw duplicate(e, kind)
    }
  }

  async updateOption(
    kind: "category" | "mode",
    bookId: string,
    id: string,
    input: Partial<SaveCashbookOptionInput>
  ): Promise<CashbookOption> {
    await this.access.require(bookId, "admin")
    const t = table(kind)
    try {
      const [row] = await this.db
        .update(t)
        .set(input)
        .where(and(eq(t.bookId, bookId), eq(t.id, id)))
        .returning({ id: t.id, name: t.name, archived: t.archived })
      if (!row) throw new NotFoundException(`${label(kind)} not found`)
      return row
    } catch (e) {
      throw duplicate(e, kind)
    }
  }

  /** Entries keep their amounts; they just lose the category or mode. */
  async removeOption(
    kind: "category" | "mode",
    bookId: string,
    id: string
  ): Promise<void> {
    await this.access.require(bookId, "admin")
    const t = table(kind)
    await this.db.delete(t).where(and(eq(t.bookId, bookId), eq(t.id, id)))
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private bookScope(bookId: string) {
    return and(
      eq(cashbooks.workspaceId, this.ctx.workspaceId),
      eq(cashbooks.id, bookId)
    )
  }

  private async hasEntries(bookId: string): Promise<boolean> {
    const [r] = await this.db
      .select({ n: count() })
      .from(cashbookEntries)
      .where(
        and(
          eq(cashbookEntries.bookId, bookId),
          isNull(cashbookEntries.deletedAt)
        )
      )
    return (r?.n ?? 0) > 0
  }

  private async memberRole(
    bookId: string,
    memberId: string
  ): Promise<CashbookRole> {
    const [r] = await this.db
      .select({ role: cashbookMembers.role })
      .from(cashbookMembers)
      .where(
        and(
          eq(cashbookMembers.bookId, bookId),
          eq(cashbookMembers.memberId, memberId)
        )
      )
    if (!r) throw new NotFoundException("Not a member of this book")
    return r.role
  }

  private async assertAnotherOwner(bookId: string, memberId: string) {
    const [r] = await this.db
      .select({ n: count() })
      .from(cashbookMembers)
      .where(
        and(
          eq(cashbookMembers.bookId, bookId),
          eq(cashbookMembers.role, "owner"),
          sql`${cashbookMembers.memberId} <> ${memberId}`
        )
      )
    if ((r?.n ?? 0) === 0)
      throw new BadRequestException({
        message:
          "A book needs at least one owner. Make someone else owner first.",
        code: "cashbook_last_owner",
      })
  }

  /** Balances, totals, member counts and last activity for books. */
  private async withStats(
    books: { book: CashbookRow; role: CashbookRole }[]
  ): Promise<Cashbook[]> {
    if (books.length === 0) return []
    const ids = books.map((b) => b.book.id)
    const [totals, members] = await Promise.all([
      this.db
        .select({
          bookId: cashbookEntries.bookId,
          totalIn: sql<string>`coalesce(sum(${cashbookEntries.amount}) filter (where ${cashbookEntries.type} = 'in' and ${cashbookEntries.deletedAt} is null), 0)`,
          totalOut: sql<string>`coalesce(sum(${cashbookEntries.amount}) filter (where ${cashbookEntries.type} = 'out' and ${cashbookEntries.deletedAt} is null), 0)`,
          entries:
            sql<number>`count(*) filter (where ${cashbookEntries.deletedAt} is null)`.mapWith(
              Number
            ),
          last: max(cashbookEntries.updatedAt),
        })
        .from(cashbookEntries)
        .where(inArray(cashbookEntries.bookId, ids))
        .groupBy(cashbookEntries.bookId),
      this.db
        .select({ bookId: cashbookMembers.bookId, n: count() })
        .from(cashbookMembers)
        .where(inArray(cashbookMembers.bookId, ids))
        .groupBy(cashbookMembers.bookId),
    ])
    const byBook = new Map(totals.map((t) => [t.bookId, t]))
    const memberCount = new Map(members.map((m) => [m.bookId, m.n]))
    return books.map(({ book, role }) => {
      const t = byBook.get(book.id)
      const totalIn = Number(t?.totalIn ?? 0)
      const totalOut = Number(t?.totalOut ?? 0)
      return {
        id: book.id,
        name: book.name,
        currency: book.currency,
        fields: { ...DEFAULT_FIELDS, ...book.fields },
        archivedAt: book.archivedAt?.toISOString() ?? null,
        role,
        balance: totalIn - totalOut,
        totalIn,
        totalOut,
        entryCount: t?.entries ?? 0,
        memberCount: memberCount.get(book.id) ?? 0,
        lastActivityAt: t?.last?.toISOString() ?? null,
        createdAt: book.createdAt.toISOString(),
      }
    })
  }
}

function table(kind: "category" | "mode"): OptionTable {
  return kind === "category" ? cashbookCategories : cashbookModes
}

function label(kind: "category" | "mode") {
  return kind === "category" ? "Category" : "Payment mode"
}

function duplicate(e: unknown, kind: "category" | "mode") {
  if (isUniqueViolation(e))
    return new ConflictException({
      message: `This book already has a ${label(kind).toLowerCase()} with that name`,
      code: "cashbook_option_exists",
    })
  return e
}
