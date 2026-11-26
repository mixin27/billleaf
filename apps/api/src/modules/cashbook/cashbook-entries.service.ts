import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  CASHBOOK_ATTACHMENT_MAX_BYTES,
  CASHBOOK_MAX_ATTACHMENTS,
  type CashbookAttachment,
  type CashbookEntry,
  type CashbookEntryActivity,
  type CashbookEntryList,
  type CashbookFilter,
  type CashbookRole,
  type CreateCashbookEntryInput,
  toMinorUnits,
  type TransferCashbookEntriesInput,
  type UpdateCashbookEntryInput,
} from "@workspace/contracts"
import {
  auditLogs,
  cashbookCategories,
  cashbookEntries,
  cashbookEntryFiles,
  cashbookModes,
  files,
  member,
  user,
} from "@workspace/db"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { offsetOf } from "../../common/pagination.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { StorageService } from "../../core/storage/storage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { todayIn } from "../documents/party-snapshot.js"
import { FilesService } from "../files/files.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { CashbookAccess, type CashbookRow } from "./cashbook-access.service.js"
import { signed } from "./cashbook.service.js"

const e = cashbookEntries
type EntryRow = typeof cashbookEntries.$inferSelect

/** "14:05" in a timezone. */
export function clockIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now)
}

/** Entry order: oldest first for balances, reversed for lists. */
const CHRONO = [e.entryDate, e.entryTime, e.createdAt, e.id] as const

/** Fields an update can change, compared for the activity log. */
const TRACKED = [
  "type",
  "amount",
  "entryDate",
  "entryTime",
  "remark",
  "contactName",
  "categoryId",
  "modeId",
] as const

/** Entries of a cashbook: list with running balance, changes, attachments. */
@Injectable()
export class CashbookEntriesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly access: CashbookAccess,
    private readonly profile: WorkspaceProfileService,
    private readonly files: FilesService,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  /**
   * One page, newest first. Each entry carries the book's balance right
   * after it (over the whole book, whatever the filters); totals cover
   * every entry that matches the filters.
   */
  async list(
    bookId: string,
    q: CashbookFilter & { page: number; pageSize: number }
  ): Promise<CashbookEntryList> {
    const { book, role } = await this.access.book(bookId)
    const where = this.filters(book, q)
    const [rows, [agg]] = await Promise.all([
      this.rows(bookId, where)
        .orderBy(...CHRONO.map((c) => desc(c)))
        .limit(q.pageSize)
        .offset(offsetOf(q.page, q.pageSize)),
      this.db
        .select({
          n: count(),
          totalIn: sql<string>`coalesce(sum(${e.amount}) filter (where ${e.type} = 'in'), 0)`,
          totalOut: sql<string>`coalesce(sum(${e.amount}) filter (where ${e.type} = 'out'), 0)`,
        })
        .from(e)
        .where(where),
    ])
    const items = await this.toDtos(rows, role)
    const totalIn = Number(agg?.totalIn ?? 0)
    const totalOut = Number(agg?.totalOut ?? 0)
    return {
      items,
      total: agg?.n ?? 0,
      page: q.page,
      pageSize: q.pageSize,
      totals: { totalIn, totalOut, net: totalIn - totalOut },
    }
  }

  /** Every matching entry, oldest first (exports and statements). */
  async all(
    bookId: string,
    q: CashbookFilter,
    limit = 50_000
  ): Promise<{ book: CashbookRow; entries: CashbookEntry[] }> {
    const { book, role } = await this.access.book(bookId)
    const rows = await this.rows(bookId, this.filters(book, q))
      .orderBy(...CHRONO.map((c) => asc(c)))
      .limit(limit)
    return { book, entries: await this.toDtos(rows, role, false) }
  }

  async get(bookId: string, id: string): Promise<CashbookEntry> {
    const { role } = await this.access.book(bookId)
    const [row] = await this.rows(
      bookId,
      and(eq(e.bookId, bookId), eq(e.id, id), isNull(e.deletedAt))!
    )
    if (!row) throw new NotFoundException("Entry not found")
    const [dto] = await this.toDtos([row], role)
    return dto!
  }

  async create(
    bookId: string,
    input: CreateCashbookEntryInput
  ): Promise<CashbookEntry> {
    const { book } = await this.access.require(bookId, "operator")
    assertOpen(book)
    await this.assertOptions(bookId, input)
    const profile = await this.profile.get()
    const [row] = await this.db
      .insert(e)
      .values({
        workspaceId: this.ctx.workspaceId,
        bookId,
        type: input.type,
        amount: input.amount,
        entryDate: input.entryDate ?? todayIn(profile.timezone),
        entryTime: input.entryTime ?? clockIn(profile.timezone),
        remark: input.remark ?? null,
        contactName: input.contactName ?? null,
        categoryId: input.categoryId ?? null,
        modeId: input.modeId ?? null,
        createdByMemberId: this.ctx.memberId,
      })
      .returning({ id: e.id })
    await this.audit.record("cashbook.entry_created", {
      resourceType: "cashbook_entry",
      resourceId: row!.id,
      metadata: { bookId, type: input.type, amount: input.amount },
    })
    return this.get(bookId, row!.id)
  }

  async update(
    bookId: string,
    id: string,
    input: UpdateCashbookEntryInput
  ): Promise<CashbookEntry> {
    const { book, role } = await this.access.book(bookId)
    assertOpen(book)
    const entry = await this.require(bookId, id)
    this.access.assertCanEditEntry(role, entry)
    await this.assertOptions(bookId, input)
    const values: Partial<typeof e.$inferInsert> = {}
    const changes: Record<string, [unknown, unknown]> = {}
    for (const k of TRACKED) {
      const next = input[k]
      if (next === undefined) continue
      const before = k === "entryTime" ? entry.entryTime.slice(0, 5) : entry[k]
      if ((next ?? null) === (before ?? null)) continue
      changes[k] = [before ?? null, next ?? null]
      ;(values as Record<string, unknown>)[k] = next ?? null
    }
    if (Object.keys(changes).length === 0) return this.get(bookId, id)
    await this.db
      .update(e)
      .set({ ...values, updatedByMemberId: this.ctx.memberId })
      .where(and(eq(e.bookId, bookId), eq(e.id, id)))
    await this.audit.record("cashbook.entry_updated", {
      resourceType: "cashbook_entry",
      resourceId: id,
      metadata: { bookId, changes },
    })
    return this.get(bookId, id)
  }

  /** Soft delete: the entry leaves the balance but stays in the audit trail. */
  async remove(bookId: string, ids: string[]): Promise<{ deleted: number }> {
    const { book, role } = await this.access.book(bookId)
    assertOpen(book)
    const rows = await this.db
      .select()
      .from(e)
      .where(and(eq(e.bookId, bookId), inArray(e.id, ids), isNull(e.deletedAt)))
    if (rows.length !== new Set(ids).size)
      throw new NotFoundException("Some entries weren't found")
    for (const r of rows) this.access.assertCanEditEntry(role, r)
    await this.db
      .update(e)
      .set({ deletedAt: new Date(), updatedByMemberId: this.ctx.memberId })
      .where(and(eq(e.bookId, bookId), inArray(e.id, ids)))
    for (const r of rows)
      await this.audit.record("cashbook.entry_deleted", {
        resourceType: "cashbook_entry",
        resourceId: r.id,
        metadata: { bookId, type: r.type, amount: r.amount },
      })
    return { deleted: rows.length }
  }

  /**
   * Move or copy entries to another book in the same currency. Categories
   * and modes are matched by name in the other book (created if missing).
   * Needs admin in both books.
   */
  async transfer(
    bookId: string,
    input: TransferCashbookEntriesInput
  ): Promise<{ count: number }> {
    if (input.toBookId === bookId)
      throw new BadRequestException("Pick a different book")
    const from = await this.access.require(bookId, "admin")
    const to = await this.access.require(input.toBookId, "admin")
    assertOpen(to.book)
    if (input.mode === "move") assertOpen(from.book)
    if (from.book.currency !== to.book.currency)
      throw new BadRequestException({
        message: `Both books need the same currency (${from.book.currency} and ${to.book.currency})`,
        code: "cashbook_currency_mismatch",
      })
    const ids = [...new Set(input.entryIds)]
    const rows = await this.db
      .select()
      .from(e)
      .where(and(eq(e.bookId, bookId), inArray(e.id, ids), isNull(e.deletedAt)))
    if (rows.length !== ids.length)
      throw new NotFoundException("Some entries weren't found")

    await this.db.transaction(async (tx) => {
      const categoryIn = await this.optionMap(
        tx,
        cashbookCategories,
        rows.map((r) => r.categoryId),
        input.toBookId
      )
      const modeIn = await this.optionMap(
        tx,
        cashbookModes,
        rows.map((r) => r.modeId),
        input.toBookId
      )
      for (const r of rows) {
        const mapped = {
          bookId: input.toBookId,
          categoryId: r.categoryId
            ? (categoryIn.get(r.categoryId) ?? null)
            : null,
          modeId: r.modeId ? (modeIn.get(r.modeId) ?? null) : null,
        }
        if (input.mode === "move") {
          await tx
            .update(e)
            .set({ ...mapped, updatedByMemberId: this.ctx.memberId })
            .where(eq(e.id, r.id))
        } else {
          await tx.insert(e).values({
            workspaceId: this.ctx.workspaceId,
            type: r.type,
            amount: r.amount,
            entryDate: r.entryDate,
            entryTime: r.entryTime,
            remark: r.remark,
            contactName: r.contactName,
            createdByMemberId: this.ctx.memberId,
            ...mapped,
          })
        }
      }
    })
    for (const r of rows)
      await this.audit.record(
        input.mode === "move"
          ? "cashbook.entry_moved"
          : "cashbook.entry_copied",
        {
          resourceType: "cashbook_entry",
          resourceId: r.id,
          metadata: { bookId, toBookId: input.toBookId },
        }
      )
    return { count: rows.length }
  }

  // ── Attachments ────────────────────────────────────────────────────────

  async addAttachment(
    bookId: string,
    id: string,
    file: { filename: string; body: Buffer }
  ): Promise<CashbookEntry> {
    const { book, role } = await this.access.book(bookId)
    assertOpen(book)
    const entry = await this.require(bookId, id)
    this.access.assertCanEditEntry(role, entry)
    const [n] = await this.db
      .select({ n: count() })
      .from(cashbookEntryFiles)
      .where(eq(cashbookEntryFiles.entryId, id))
    if ((n?.n ?? 0) >= CASHBOOK_MAX_ATTACHMENTS)
      throw new BadRequestException({
        message: `An entry can have up to ${CASHBOOK_MAX_ATTACHMENTS} attachments`,
        code: "cashbook_attachment_limit",
      })
    const stored = await this.files.uploadImage(
      "cashbook_attachment",
      file.filename,
      file.body,
      CASHBOOK_ATTACHMENT_MAX_BYTES,
      { allowPdf: true }
    )
    await this.db.insert(cashbookEntryFiles).values({
      workspaceId: this.ctx.workspaceId,
      entryId: id,
      fileId: stored.id,
      position: n?.n ?? 0,
    })
    return this.get(bookId, id)
  }

  async removeAttachment(
    bookId: string,
    id: string,
    fileId: string
  ): Promise<CashbookEntry> {
    const { book, role } = await this.access.book(bookId)
    assertOpen(book)
    const entry = await this.require(bookId, id)
    this.access.assertCanEditEntry(role, entry)
    const [link] = await this.db
      .delete(cashbookEntryFiles)
      .where(
        and(
          eq(cashbookEntryFiles.entryId, id),
          eq(cashbookEntryFiles.fileId, fileId)
        )
      )
      .returning({ fileId: cashbookEntryFiles.fileId })
    if (!link) throw new NotFoundException("Attachment not found")
    await this.files.remove(fileId)
    return this.get(bookId, id)
  }

  // ── Activity ───────────────────────────────────────────────────────────

  /** What happened to an entry, newest first. */
  async activity(bookId: string, id: string): Promise<CashbookEntryActivity> {
    await this.access.book(bookId)
    await this.require(bookId, id, { includeDeleted: true })
    const rows = await this.db
      .select({
        action: auditLogs.action,
        at: auditLogs.createdAt,
        by: user.name,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .leftJoin(user, eq(user.id, auditLogs.actorUserId))
      .where(
        and(
          eq(auditLogs.workspaceId, this.ctx.workspaceId),
          eq(auditLogs.resourceType, "cashbook_entry"),
          eq(auditLogs.resourceId, id)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(100)
    return {
      items: rows.map((r) => ({
        action: r.action.replace("cashbook.entry_", "") as
          "created" | "updated" | "deleted" | "moved" | "copied",
        at: r.at.toISOString(),
        by: r.by,
        changes:
          (r.metadata?.changes as Record<string, [unknown, unknown]>) ?? {},
      })),
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Entries joined with names, with the running balance over the book. */
  private rows(bookId: string, where: SQL) {
    const running = this.db
      .select({
        id: e.id,
        balance:
          sql<string>`sum(${signed}) over (order by ${e.entryDate}, ${e.entryTime}, ${e.createdAt}, ${e.id})`.as(
            "balance"
          ),
      })
      .from(e)
      .where(and(eq(e.bookId, bookId), isNull(e.deletedAt)))
      .as("running")
    return this.db
      .select({
        entry: e,
        balance: running.balance,
        categoryName: cashbookCategories.name,
        modeName: cashbookModes.name,
        creatorName: user.name,
      })
      .from(e)
      .innerJoin(running, eq(running.id, e.id))
      .leftJoin(cashbookCategories, eq(cashbookCategories.id, e.categoryId))
      .leftJoin(cashbookModes, eq(cashbookModes.id, e.modeId))
      .leftJoin(member, eq(member.id, e.createdByMemberId))
      .leftJoin(user, eq(user.id, member.userId))
      .where(where)
      .$dynamic()
  }

  /** Filters shared by lists, exports and reports. */
  filters(book: CashbookRow, q: CashbookFilter): SQL {
    const conds: (SQL | undefined)[] = [
      eq(e.bookId, book.id),
      isNull(e.deletedAt),
      q.from ? gte(e.entryDate, q.from) : undefined,
      q.to ? lte(e.entryDate, q.to) : undefined,
      q.type ? eq(e.type, q.type) : undefined,
      q.categoryId ? eq(e.categoryId, q.categoryId) : undefined,
      q.modeId ? eq(e.modeId, q.modeId) : undefined,
      q.memberId ? eq(e.createdByMemberId, q.memberId) : undefined,
    ]
    const text = q.q?.trim()
    if (text) {
      const like = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      const amount = toMinorUnits(text, book.currency)
      conds.push(
        or(
          ilike(e.remark, like),
          ilike(e.contactName, like),
          amount !== null && amount > 0 ? eq(e.amount, amount) : undefined
        )
      )
    }
    return and(...conds)!
  }

  private async require(
    bookId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {}
  ): Promise<EntryRow> {
    const [row] = await this.db
      .select()
      .from(e)
      .where(
        and(
          eq(e.bookId, bookId),
          eq(e.id, id),
          opts.includeDeleted ? undefined : isNull(e.deletedAt)
        )
      )
    if (!row) throw new NotFoundException("Entry not found")
    return row
  }

  /** Category and mode must belong to this book. */
  private async assertOptions(
    bookId: string,
    input: { categoryId?: string | null; modeId?: string | null }
  ) {
    for (const [t, id, label] of [
      [cashbookCategories, input.categoryId, "category"],
      [cashbookModes, input.modeId, "payment mode"],
    ] as const) {
      if (!id) continue
      const [r] = await this.db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.bookId, bookId), eq(t.id, id)))
      if (!r) throw new BadRequestException(`That ${label} isn't in this book`)
    }
  }

  /** Source option id → the same-named option in `bookId`, created if missing. */
  private async optionMap(
    tx: Database,
    t: typeof cashbookCategories | typeof cashbookModes,
    ids: (string | null)[],
    bookId: string
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))]
    if (wanted.length === 0) return new Map()
    const source = await tx
      .select({ id: t.id, name: t.name })
      .from(t)
      .where(inArray(t.id, wanted))
    if (source.length)
      await tx
        .insert(t)
        .values(
          source.map((s) => ({
            workspaceId: this.ctx.workspaceId,
            bookId,
            name: s.name,
          }))
        )
        .onConflictDoNothing()
    const target = await tx
      .select({ id: t.id, name: t.name })
      .from(t)
      .where(eq(t.bookId, bookId))
    const byName = new Map(target.map((x) => [x.name.toLowerCase(), x.id]))
    return new Map(
      source.flatMap((s) => {
        const id = byName.get(s.name.toLowerCase())
        return id ? [[s.id, id] as const] : []
      })
    )
  }

  private async toDtos(
    rows: {
      entry: EntryRow
      balance: string
      categoryName: string | null
      modeName: string | null
      creatorName: string | null
    }[],
    role: CashbookRole,
    withLinks = true
  ): Promise<CashbookEntry[]> {
    const attachments = await this.attachments(
      rows.map((r) => r.entry.id),
      withLinks
    )
    const now = new Date()
    return rows.map(({ entry: x, ...r }) => ({
      id: x.id,
      bookId: x.bookId,
      type: x.type,
      amount: x.amount,
      entryDate: x.entryDate,
      entryTime: x.entryTime.slice(0, 5),
      remark: x.remark,
      contactName: x.contactName,
      categoryId: x.categoryId,
      categoryName: r.categoryName,
      modeId: x.modeId,
      modeName: r.modeName,
      balance: Number(r.balance),
      createdBy: x.createdByMemberId
        ? {
            memberId: x.createdByMemberId,
            name: r.creatorName ?? "Former member",
            you: x.createdByMemberId === this.ctx.memberId,
          }
        : null,
      editable: this.access.canEditEntry(role, x, now),
      edited: x.updatedByMemberId !== null,
      attachments: attachments.get(x.id) ?? [],
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString(),
    }))
  }

  private async attachments(
    entryIds: string[],
    withLinks: boolean
  ): Promise<Map<string, CashbookAttachment[]>> {
    const out = new Map<string, CashbookAttachment[]>()
    if (entryIds.length === 0) return out
    const rows = await this.db
      .select({
        entryId: cashbookEntryFiles.entryId,
        id: files.id,
        key: files.key,
        filename: files.filename,
        contentType: files.contentType,
        size: files.size,
      })
      .from(cashbookEntryFiles)
      .innerJoin(files, eq(files.id, cashbookEntryFiles.fileId))
      .where(inArray(cashbookEntryFiles.entryId, entryIds))
      .orderBy(asc(cashbookEntryFiles.position))
    for (const r of rows) {
      const list = out.get(r.entryId) ?? []
      list.push({
        id: r.id,
        filename: r.filename,
        contentType: r.contentType,
        size: r.size,
        url: withLinks ? await this.storage.presignGet(r.key) : "",
      })
      out.set(r.entryId, list)
    }
    return out
  }
}

function assertOpen(book: CashbookRow) {
  if (book.archivedAt)
    throw new ConflictException({
      message: "This book is archived. Unarchive it to make changes.",
      code: "cashbook_archived",
    })
}
