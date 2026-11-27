import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common"
import type { CashbookImportResult } from "@workspace/contracts"
import {
  cashbookCategories,
  cashbookEntries,
  cashbookMembers,
  cashbookModes,
  member,
  user,
} from "@workspace/db"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"

import { RequestContext } from "../../common/context/request-context.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { CashbookAccess } from "./cashbook-access.service.js"
import {
  type CashbookCsvRow,
  CashbookCsvFormatError,
  importKeys,
  parseCashbookCsv,
} from "./cashbook-csv.js"
import { signed } from "./cashbook.service.js"

const e = cashbookEntries
const MAX_ROWS = 20_000
const CHUNK = 500

/**
 * Import the CashBook app's CSV export into a book (PR 4 of ADR-0019's
 * plan). A dry run reports what would happen; the real run adds the new
 * rows. Every row carries an `importKey` fingerprint, so importing the same
 * file again adds nothing. Needs admin in the book.
 */
@Injectable()
export class CashbookImportService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly ctx: RequestContext,
    private readonly access: CashbookAccess,
    private readonly audit: AuditService
  ) {}

  async import(
    bookId: string,
    file: { filename: string; text: string },
    opts: { dryRun: boolean }
  ): Promise<CashbookImportResult> {
    const { book } = await this.access.require(bookId, "admin")
    if (book.archivedAt)
      throw new ConflictException({
        message: "This book is archived. Unarchive it to import.",
        code: "cashbook_archived",
      })

    let parsed
    try {
      parsed = parseCashbookCsv(file.text, book.currency)
    } catch (err) {
      if (err instanceof CashbookCsvFormatError)
        throw new BadRequestException({
          message: err.message,
          code: "cashbook_import_format",
        })
      throw err
    }
    const { rows, invalid } = parsed
    if (rows.length > MAX_ROWS)
      throw new BadRequestException({
        message: `Up to ${MAX_ROWS.toLocaleString("en")} rows per file; export a shorter date range`,
        code: "cashbook_import_too_large",
      })

    // Already imported? Deleted entries count too: deleting an imported
    // entry and importing again shouldn't bring it back.
    const keys = importKeys(rows)
    const existing = new Set<string>()
    for (let i = 0; i < keys.length; i += CHUNK) {
      const found = await this.db
        .select({ key: e.importKey })
        .from(e)
        .where(
          and(
            eq(e.bookId, bookId),
            inArray(e.importKey, keys.slice(i, i + CHUNK))
          )
        )
      for (const f of found) if (f.key) existing.add(f.key)
    }
    const fresh = rows
      .map((r, i) => ({ row: r, key: keys[i]! }))
      .filter((x) => !existing.has(x.key))

    const modes = await this.optionIds(cashbookModes, bookId)
    const categories = await this.optionIds(cashbookCategories, bookId)
    const newModes = missing(
      fresh.map((x) => x.row.mode),
      modes
    )
    const newCategories = missing(
      fresh.map((x) => x.row.category),
      categories
    )
    const people = await this.bookMembersByName(bookId)
    const unmatchedPeople = [
      ...new Set(
        fresh
          .map((x) => x.row.entryBy)
          .filter((n): n is string => !!n && !people.has(n.toLowerCase()))
      ),
    ]

    const [{ balance } = { balance: 0 }] = await this.db
      .select({ balance: sql<number>`coalesce(sum(${signed}), 0)::bigint` })
      .from(e)
      .where(and(eq(e.bookId, bookId), isNull(e.deletedAt)))
    const balanceBefore = Number(balance)
    const totalIn = sum(fresh.filter((x) => x.row.type === "in"))
    const totalOut = sum(fresh.filter((x) => x.row.type === "out"))
    const first = rows[0]
    const last = rows[rows.length - 1]
    const dates = rows.map((r) => r.entryDate).sort()

    const result: CashbookImportResult = {
      dryRun: opts.dryRun,
      rows: rows.length,
      added: fresh.length,
      duplicates: rows.length - fresh.length,
      invalid,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      totalIn,
      totalOut,
      balanceBefore,
      balanceAfter: balanceBefore + totalIn - totalOut,
      fileOpeningBalance:
        first && first.balance !== null
          ? first.balance - signedAmount(first)
          : null,
      fileClosingBalance: last?.balance ?? null,
      newModes,
      newCategories,
      unmatchedPeople,
    }
    if (opts.dryRun || fresh.length === 0) return result

    const added = await this.db.transaction(async (tx) => {
      const modeIds = await this.ensureOptions(
        tx,
        cashbookModes,
        bookId,
        newModes,
        modes
      )
      const categoryIds = await this.ensureOptions(
        tx,
        cashbookCategories,
        bookId,
        newCategories,
        categories
      )
      let n = 0
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const inserted = await tx
          .insert(e)
          .values(
            fresh.slice(i, i + CHUNK).map(({ row: r, key }) => ({
              workspaceId: this.ctx.workspaceId,
              bookId,
              type: r.type,
              amount: r.amount,
              entryDate: r.entryDate,
              entryTime: r.entryTime,
              remark: r.remark,
              contactName: r.contactName,
              modeId: r.mode
                ? (modeIds.get(r.mode.toLowerCase()) ?? null)
                : null,
              categoryId: r.category
                ? (categoryIds.get(r.category.toLowerCase()) ?? null)
                : null,
              createdByMemberId:
                (r.entryBy && people.get(r.entryBy.toLowerCase())) ||
                this.ctx.memberId,
              importKey: key,
            }))
          )
          .onConflictDoNothing()
          .returning({ id: e.id })
        n += inserted.length
      }
      return n
    })

    await this.audit.record("cashbook.imported", {
      resourceType: "cashbook",
      resourceId: bookId,
      metadata: {
        filename: file.filename,
        rows: rows.length,
        added,
        duplicates: result.duplicates,
        invalid: invalid.length,
      },
    })
    // A concurrent import of the same file may have taken some rows.
    return added === fresh.length
      ? result
      : { ...result, added, duplicates: rows.length - added }
  }

  /** lower(name) → id of a book's modes or categories. */
  private async optionIds(
    table: typeof cashbookModes | typeof cashbookCategories,
    bookId: string
  ) {
    const rows = await this.db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.bookId, bookId))
    return new Map(rows.map((r) => [r.name.toLowerCase(), r.id]))
  }

  private async ensureOptions(
    tx: Database,
    table: typeof cashbookModes | typeof cashbookCategories,
    bookId: string,
    names: string[],
    known: Map<string, string>
  ) {
    const ids = new Map(known)
    if (!names.length) return ids
    await tx
      .insert(table)
      .values(
        names.map((name) => ({
          workspaceId: this.ctx.workspaceId,
          bookId,
          name: name.slice(0, 60),
        }))
      )
      .onConflictDoNothing()
    const rows = await tx
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.bookId, bookId))
    for (const r of rows) ids.set(r.name.toLowerCase(), r.id)
    return ids
  }

  /** lower(display name) → workspace member id, for the book's members. */
  private async bookMembersByName(bookId: string) {
    const rows = await this.db
      .select({ memberId: cashbookMembers.memberId, name: user.name })
      .from(cashbookMembers)
      .innerJoin(member, eq(member.id, cashbookMembers.memberId))
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(cashbookMembers.bookId, bookId))
    return new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.memberId]))
  }
}

const signedAmount = (r: CashbookCsvRow) =>
  r.type === "in" ? r.amount : -r.amount

const sum = (xs: { row: CashbookCsvRow }[]) =>
  xs.reduce((s, x) => s + x.row.amount, 0)

/** Names not yet in the book (first spelling wins), in file order. */
function missing(
  names: (string | null)[],
  known: Map<string, string>
): string[] {
  const out = new Map<string, string>()
  for (const n of names)
    if (n && !known.has(n.toLowerCase()) && !out.has(n.toLowerCase()))
      out.set(n.toLowerCase(), n.slice(0, 60))
  return [...out.values()]
}
