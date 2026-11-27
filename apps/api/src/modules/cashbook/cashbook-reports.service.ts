import { Injectable } from "@nestjs/common"
import {
  type CashbookEntry,
  type CashbookFilter,
  type CashbookReport,
  formatMoney,
  fromMinorUnits,
} from "@workspace/contracts"
import { cashbookEntries, user } from "@workspace/db"
import { and, eq, isNull, lt, sql } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"
import { RequestContext } from "../../common/context/request-context.js"
import { cjkFontsFor } from "../documents/document-pdf.js"
import { csvCell } from "../time/time-reports.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { CashbookEntriesService } from "./cashbook-entries.service.js"
import { type CashbookRow } from "./cashbook-access.service.js"
import { renderCashbookStatementPdf } from "./cashbook-statement-pdf.js"
import { signed } from "./cashbook.service.js"

type Totals = { totalIn: number; totalOut: number }

/** Only a date range: the opening balance is the book's real balance. */
const dateOnly = (q: CashbookFilter) =>
  !q.type && !q.categoryId && !q.modeId && !q.memberId && !q.q

/** Summaries, CSV export and the PDF statement of a cashbook. */
@Injectable()
export class CashbookReportsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly entries: CashbookEntriesService,
    private readonly profile: WorkspaceProfileService,
    private readonly ctx: RequestContext
  ) {}

  async report(bookId: string, q: CashbookFilter): Promise<CashbookReport> {
    const { book, entries } = await this.entries.all(bookId, q)
    return this.summarize(book, q, entries)
  }

  /** Oldest first, with the running balance, ready for Excel. */
  async csv(
    bookId: string,
    q: CashbookFilter
  ): Promise<{ filename: string; content: string }> {
    const { book, entries } = await this.entries.all(bookId, q)
    const amount = (n: number) => fromMinorUnits(n, book.currency)
    const lines: string[][] = [
      [
        "Date",
        "Time",
        "Remark",
        "Contact",
        "Category",
        "Mode",
        "Cash in",
        "Cash out",
        "Balance",
        "Entry by",
      ],
      ...entries.map((x) => [
        x.entryDate,
        x.entryTime,
        x.remark ?? "",
        x.contactName ?? "",
        x.categoryName ?? "",
        x.modeName ?? "",
        x.type === "in" ? amount(x.amount) : "",
        x.type === "out" ? amount(x.amount) : "",
        amount(x.balance),
        x.createdBy?.name ?? "",
      ]),
    ]
    return {
      filename: `${fileStem(book.name)}${rangeSuffix(q)}.csv`,
      content: "﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n"),
    }
  }

  /**
   * A4 statement (see `cashbook-statement-pdf.ts`): branded header, summary
   * boxes, a ruled table of the filtered entries and a final balance row.
   */
  async pdf(
    bookId: string,
    q: CashbookFilter
  ): Promise<{ filename: string; content: Buffer }> {
    const { book, entries } = await this.entries.all(bookId, q)
    const report = await this.summarize(book, q, entries)
    const profile = await this.profile.get()
    const branding = await this.profile.documentBranding()
    const cjk = await cjkFontsFor(
      entries.map((x) => `${x.remark ?? ""} ${x.contactName ?? ""}`),
      profile.locale
    )
    const userId = this.ctx.optionalUserId
    const [me] = userId
      ? await this.db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, userId))
      : []
    const content = await renderCashbookStatementPdf({
      book,
      entries,
      report,
      filterLabel: filterLabel(q, entries),
      workspaceName: profile.name,
      generatedBy: me?.name ?? null,
      generatedAt: new Date(),
      timezone: profile.timezone,
      locale: profile.locale,
      brandColor: branding.brandColor,
      logo: branding.logo,
      cjk,
    })
    return {
      filename: `${fileStem(book.name)}${rangeSuffix(q)}.pdf`,
      content,
    }
  }

  private async summarize(
    book: CashbookRow,
    q: CashbookFilter,
    entries: CashbookEntry[]
  ): Promise<CashbookReport> {
    const openingBalance =
      q.from && dateOnly(q) ? await this.balanceBefore(book.id, q.from) : 0
    const day = new Map<string, Totals>()
    const category = new Map<
      string,
      Totals & { id: string | null; name: string }
    >()
    const mode = new Map<string, Totals & { id: string | null; name: string }>()
    let totalIn = 0
    let totalOut = 0
    const add = (t: Totals, x: CashbookEntry) => {
      if (x.type === "in") t.totalIn += x.amount
      else t.totalOut += x.amount
    }
    for (const x of entries) {
      if (x.type === "in") totalIn += x.amount
      else totalOut += x.amount
      const d = day.get(x.entryDate) ?? { totalIn: 0, totalOut: 0 }
      add(d, x)
      day.set(x.entryDate, d)
      const c = category.get(x.categoryId ?? "") ?? {
        id: x.categoryId,
        name: x.categoryName ?? "No category",
        totalIn: 0,
        totalOut: 0,
      }
      add(c, x)
      category.set(x.categoryId ?? "", c)
      const m = mode.get(x.modeId ?? "") ?? {
        id: x.modeId,
        name: x.modeName ?? "No mode",
        totalIn: 0,
        totalOut: 0,
      }
      add(m, x)
      mode.set(x.modeId ?? "", m)
    }
    let running = openingBalance
    const byDay = [...day.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, t]) => {
        running += t.totalIn - t.totalOut
        return { date, ...t, balance: running }
      })
    const bySize = (a: Totals, b: Totals) =>
      b.totalIn + b.totalOut - (a.totalIn + a.totalOut)
    return {
      from: q.from ?? null,
      to: q.to ?? null,
      currency: book.currency,
      openingBalance,
      totalIn,
      totalOut,
      closingBalance: openingBalance + totalIn - totalOut,
      byDay,
      byCategory: [...category.values()].sort(bySize),
      byMode: [...mode.values()].sort(bySize),
    }
  }

  private async balanceBefore(bookId: string, date: string): Promise<number> {
    const [r] = await this.db
      .select({ n: sql<string>`coalesce(sum(${signed}), 0)` })
      .from(cashbookEntries)
      .where(
        and(
          eq(cashbookEntries.bookId, bookId),
          isNull(cashbookEntries.deletedAt),
          lt(cashbookEntries.entryDate, date)
        )
      )
    return Number(r?.n ?? 0)
  }
}

function fileStem(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "cashbook"
  )
}

function rangeSuffix(q: CashbookFilter) {
  return q.from || q.to ? `-${q.from ?? "start"}-to-${q.to ?? "today"}` : ""
}

/**
 * The non-date filters, in words ("Cash out only · Mode: Cash"), so a
 * printed statement can't pass for the whole book. Names come from the
 * matching entries.
 */
export function filterLabel(
  q: CashbookFilter,
  entries: CashbookEntry[]
): string | null {
  const parts: string[] = []
  if (q.type) parts.push(q.type === "in" ? "Cash in only" : "Cash out only")
  const name = (pick: (e: CashbookEntry) => string | null | undefined) =>
    entries.map(pick).find(Boolean)
  if (q.categoryId)
    parts.push(`Category: ${name((e) => e.categoryName) ?? "one category"}`)
  if (q.modeId) parts.push(`Mode: ${name((e) => e.modeName) ?? "one mode"}`)
  if (q.memberId)
    parts.push(`Entry by: ${name((e) => e.createdBy?.name) ?? "one member"}`)
  if (q.q?.trim()) parts.push(`Search: "${q.q.trim()}"`)
  return parts.length ? parts.join(" · ") : null
}
