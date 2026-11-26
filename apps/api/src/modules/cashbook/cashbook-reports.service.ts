import { Injectable } from "@nestjs/common"
import {
  type CashbookEntry,
  type CashbookFilter,
  type CashbookReport,
  formatMoney,
  fromMinorUnits,
} from "@workspace/contracts"
import { cashbookEntries } from "@workspace/db"
import { and, eq, isNull, lt, sql } from "drizzle-orm"

import { InjectDb, type Database } from "../../core/database/database.module.js"
import {
  createPdf,
  cjkFontsFor,
  INK,
  MUTED,
  RULE,
} from "../documents/document-pdf.js"
import { formatDocDate } from "../documents/party-snapshot.js"
import { csvCell } from "../time/time-reports.service.js"
import { WorkspaceProfileService } from "../workspace/workspace-profile.service.js"
import { CashbookEntriesService } from "./cashbook-entries.service.js"
import { type CashbookRow } from "./cashbook-access.service.js"
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
    private readonly profile: WorkspaceProfileService
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

  /** A4 statement: opening balance, entries with running balance, closing. */
  async pdf(
    bookId: string,
    q: CashbookFilter
  ): Promise<{ filename: string; content: Buffer }> {
    const { book, entries } = await this.entries.all(bookId, q)
    const report = await this.summarize(book, q, entries)
    const profile = await this.profile.get()
    const locale = profile.locale
    const money = (n: number) =>
      formatMoney({ amount: n, currency: book.currency }, locale)
    const cjk = await cjkFontsFor(
      entries.map((x) => `${x.remark ?? ""} ${x.contactName ?? ""}`),
      locale
    )
    const { doc, done, write, heightOf, left, width } = createPdf(
      `${book.name} statement`,
      { cjk }
    )

    write(book.name, left, 50, {}, { bold: true, size: 20, color: INK })
    const period =
      q.from || q.to
        ? `${q.from ? formatDocDate(q.from, locale) : "Start"} – ${q.to ? formatDocDate(q.to, locale) : "Today"}`
        : "All entries"
    write(
      `Cashbook statement · ${period}`,
      left,
      76,
      {},
      {
        size: 10,
        color: MUTED,
      }
    )

    let y = 110
    const box = (label: string, value: string, x: number, w: number) => {
      write(label.toUpperCase(), x, y, { width: w }, { size: 7, color: MUTED })
      write(
        value,
        x,
        y + 11,
        { width: w },
        { bold: true, size: 11, color: INK }
      )
    }
    const quarter = width / 4
    box("Opening balance", money(report.openingBalance), left, quarter)
    box("Cash in", money(report.totalIn), left + quarter, quarter)
    box("Cash out", money(report.totalOut), left + quarter * 2, quarter)
    box(
      "Closing balance",
      money(report.closingBalance),
      left + quarter * 3,
      quarter
    )
    y += 44

    // Date, Remark, Mode, In, Out, Balance
    const cols = [
      { key: "date", label: "DATE", x: 0, w: 0.15 },
      { key: "remark", label: "REMARK", x: 0.15, w: 0.33 },
      { key: "mode", label: "MODE", x: 0.49, w: 0.11 },
      { key: "in", label: "CASH IN", x: 0.6, w: 0.13, right: true },
      { key: "out", label: "CASH OUT", x: 0.73, w: 0.13, right: true },
      { key: "bal", label: "BALANCE", x: 0.86, w: 0.14, right: true },
    ] as const
    const header = () => {
      for (const c of cols)
        write(
          c.label,
          left + width * c.x,
          y,
          { width: width * c.w, align: "right" in c ? "right" : "left" },
          { bold: true, size: 7, color: MUTED }
        )
      y += 14
      doc
        .moveTo(left, y - 4)
        .lineTo(left + width, y - 4)
        .strokeColor(RULE)
        .lineWidth(0.5)
        .stroke()
    }
    header()
    const bottom = doc.page.height - 60
    for (const x of entries) {
      const remark = [x.remark, x.contactName, x.categoryName]
        .filter(Boolean)
        .join(" · ")
      const h = Math.max(heightOf(remark || "—", width * 0.33), 12) + 6
      if (y + h > bottom) {
        doc.addPage()
        y = 50
        header()
      }
      const cell = { size: 8, color: INK }
      const values: Record<(typeof cols)[number]["key"], string> = {
        date: `${formatDocDate(x.entryDate, locale)} ${x.entryTime}`,
        remark: remark || "—",
        mode: x.modeName ?? "",
        in: x.type === "in" ? money(x.amount) : "",
        out: x.type === "out" ? money(x.amount) : "",
        bal: money(x.balance),
      }
      for (const c of cols)
        write(
          values[c.key],
          left + width * c.x,
          y,
          { width: width * c.w, align: "right" in c ? "right" : "left" },
          cell
        )
      y += h
    }
    if (entries.length === 0)
      write(
        "No entries in this period.",
        left,
        y,
        {},
        { size: 9, color: MUTED }
      )

    doc.end()
    return {
      filename: `${fileStem(book.name)}${rangeSuffix(q)}.pdf`,
      content: await done,
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
