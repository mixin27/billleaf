import {
  type CashbookEntry,
  type CashbookFields,
  type CashbookReport,
  displayDigits,
  fromMinorUnits,
} from "@workspace/contracts"

import { createPdf, INK, MUTED, RULE } from "../documents/document-pdf.js"

/** Cash in and cash out keep their meaning whatever the brand colour is. */
const IN = "#15803D"
const OUT = "#B42318"
const BILLLEAF_GREEN = "#15803D"
const GRID = "#C9D3CF"

export interface CashbookStatementData {
  book: { name: string; currency: string; fields: CashbookFields }
  /** Oldest first, each with its running balance. */
  entries: CashbookEntry[]
  report: CashbookReport
  /** Filters other than the dates, e.g. "Cash out only · Mode: Cash". */
  filterLabel: string | null
  workspaceName: string
  generatedBy: string | null
  generatedAt: Date
  timezone: string
  locale: string
  /** Custom branding (paid plans); null falls back to Billleaf green. */
  brandColor: string | null
  logo: Buffer | null
  cjk: { regular: Buffer; bold: Buffer } | null
}

/**
 * A4 cashbook statement, after the CashBook app's report: a tinted header
 * band, the book and period, a duration box, summary boxes, then a ruled
 * table of entries ending in a final balance row. Header rows repeat on
 * every page and each page has a footer with its number.
 */
export async function renderCashbookStatementPdf(
  d: CashbookStatementData
): Promise<Buffer> {
  const { doc, done, write, heightOf, left, width } = createPdf(
    `${d.book.name} statement`,
    { cjk: d.cjk, bufferPages: true }
  )
  const accent = validHex(d.brandColor) ?? BILLLEAF_GREEN
  const tint = mix(accent, "#FFFFFF", 0.9)
  const r = d.report
  const digits = displayDigits(d.book.currency)
  const nf = new Intl.NumberFormat(d.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const amount = (n: number) =>
    nf.format(Number(fromMinorUnits(n, d.book.currency)))
  const day = (iso: string, style: "short" | "long" = "short") =>
    new Intl.DateTimeFormat(d.locale, {
      day: "2-digit",
      month: "short",
      year: style === "short" ? "2-digit" : "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`))
  const clock = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number)
    return new Intl.DateTimeFormat(d.locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    })
      .format(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)))
      .toLowerCase()
  }
  const pageWidth = doc.page.width

  // ── Header band ─────────────────────────────────────────────────────────
  const bandH = 64
  doc.rect(0, 0, pageWidth, bandH).fill(tint)
  const mark = 36
  let markDrawn = false
  if (d.logo) {
    try {
      doc.image(d.logo, left, (bandH - mark) / 2, {
        fit: [mark, mark],
        align: "center",
        valign: "center",
      })
      markDrawn = true
    } catch {
      // Unreadable logo: fall back to initials.
    }
  }
  if (!markDrawn) {
    doc.roundedRect(left, (bandH - mark) / 2, mark, mark, 7).fill(accent)
    write(
      initials(d.workspaceName),
      left,
      (bandH - mark) / 2 + 11,
      { width: mark, align: "center" },
      { bold: true, size: 12, color: "#FFFFFF" }
    )
  }
  const textX = left + mark + 12
  write(
    `${d.workspaceName} · Cashbook report`,
    textX,
    18,
    { width: width - mark - 12, lineBreak: false, ellipsis: true },
    { bold: true, size: 13, color: INK }
  )
  const generated = new Intl.DateTimeFormat(d.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: d.timezone,
  }).format(d.generatedAt)
  write(
    `Generated ${generated}${d.generatedBy ? ` by ${d.generatedBy}` : ""}`,
    textX,
    36,
    { width: width - mark - 12, lineBreak: false, ellipsis: true },
    { size: 8.5, color: MUTED }
  )

  // ── Book, duration and filters ──────────────────────────────────────────
  let y = bandH + 24
  const period = periodLabel(r.from, r.to, d.locale)
  write(
    d.book.name,
    left,
    y,
    { lineBreak: false },
    {
      bold: true,
      size: 15,
      color: INK,
    }
  )
  if (period) {
    // Same baseline as the 15pt name: a separate run, nudged down.
    const nameW = doc.widthOfString(d.book.name)
    write(
      `·  ${period}`,
      left + nameW + 8,
      y + 4,
      { lineBreak: false },
      { size: 11, color: MUTED }
    )
  }
  y += 28

  const first = d.entries[0]
  const last = d.entries[d.entries.length - 1]
  const from = r.from ?? first?.entryDate ?? null
  const to = r.to ?? last?.entryDate ?? null
  const duration =
    from && to ? `${day(from, "long")} – ${day(to, "long")}` : "No entries"
  doc.rect(left, y, width, 24).lineWidth(0.6).strokeColor(GRID).stroke()
  write(
    "Duration:",
    left + 9,
    y + 8,
    { continued: true },
    {
      bold: true,
      size: 9,
      color: INK,
    }
  )
  write(`  ${duration}`, undefined, undefined, {}, { size: 9, color: INK })
  write(
    [d.filterLabel, `Amounts in ${d.book.currency}`]
      .filter(Boolean)
      .join("  ·  "),
    left + width / 2,
    y + 8,
    { width: width / 2 - 9, align: "right", lineBreak: false, ellipsis: true },
    { size: 8.5, color: MUTED }
  )
  y += 36

  // ── Summary boxes ───────────────────────────────────────────────────────
  const boxes: { label: string; value: number; color: string }[] = [
    ...(r.openingBalance
      ? [{ label: "Opening balance", value: r.openingBalance, color: INK }]
      : []),
    { label: "Total cash in", value: r.totalIn, color: IN },
    { label: "Total cash out", value: r.totalOut, color: OUT },
    {
      label: "Final balance",
      value: r.closingBalance,
      color: r.closingBalance < 0 ? OUT : INK,
    },
  ]
  const boxW = width / boxes.length
  const boxH = 50
  boxes.forEach((b, i) => {
    const x = left + boxW * i
    doc.rect(x, y, boxW, boxH).lineWidth(0.6).strokeColor(GRID).stroke()
    write(
      b.label,
      x + 10,
      y + 10,
      { width: boxW - 20 },
      { size: 9, color: MUTED }
    )
    write(
      amount(b.value),
      x + 10,
      y + 26,
      { width: boxW - 20, lineBreak: false, ellipsis: true },
      { bold: true, size: 13, color: b.color }
    )
  })
  y += boxH + 18
  write(
    `Total no. of entries: ${d.entries.length}`,
    left,
    y,
    {},
    { size: 9.5, color: INK }
  )
  y += 18

  // ── Entries table ───────────────────────────────────────────────────────
  type Col = {
    key: "date" | "remark" | "contact" | "mode" | "in" | "out" | "bal"
    label: string
    w: number
    right?: boolean
  }
  const cols: Col[] = [
    { key: "date", label: "Date", w: 1.25 },
    { key: "remark", label: "Remark", w: 2.6 },
    ...(d.book.fields.contact
      ? [{ key: "contact" as const, label: "Contact", w: 1.4 }]
      : []),
    ...(d.book.fields.mode
      ? [{ key: "mode" as const, label: "Mode", w: 1 }]
      : []),
    { key: "in", label: "Cash in", w: 1.35, right: true },
    { key: "out", label: "Cash out", w: 1.35, right: true },
    { key: "bal", label: "Balance", w: 1.45, right: true },
  ]
  const totalW = cols.reduce((s, c) => s + c.w, 0)
  let cx = left
  const layout = cols.map((c) => {
    const w = (c.w / totalW) * width
    const out = { ...c, x: cx, w }
    cx += w
    return out
  })
  const PAD = 5
  const bottom = doc.page.height - 56

  type Cell = { text: string; sub?: string; color?: string; bold?: boolean }
  const drawRow = (cells: Partial<Record<Col["key"], Cell>>, fill?: string) => {
    const h =
      Math.max(
        ...layout.map((c) => {
          const cell = cells[c.key]
          if (!cell) return 0
          doc.fontSize(8.5)
          const main = heightOf(cell.text || " ", c.w - PAD * 2)
          doc.fontSize(7.5)
          const sub = cell.sub ? heightOf(cell.sub, c.w - PAD * 2) + 1 : 0
          return main + sub
        }),
        10
      ) +
      PAD * 2
    if (y + h > bottom) {
      doc.addPage()
      y = 50
      header()
    }
    if (fill) doc.rect(left, y, width, h).fill(fill)
    for (const c of layout) {
      doc.rect(c.x, y, c.w, h).lineWidth(0.5).strokeColor(GRID).stroke()
      const cell = cells[c.key]
      if (!cell) continue
      write(
        cell.text,
        c.x + PAD,
        y + PAD,
        { width: c.w - PAD * 2, align: c.right ? "right" : "left" },
        { bold: cell.bold, size: 8.5, color: cell.color ?? INK }
      )
      if (cell.sub)
        write(
          cell.sub,
          c.x + PAD,
          undefined,
          { width: c.w - PAD * 2, align: c.right ? "right" : "left" },
          { size: 7.5, color: MUTED }
        )
    }
    y += h
  }
  const header = () =>
    drawRow(
      Object.fromEntries(
        layout.map((c) => [c.key, { text: c.label, bold: true }])
      ),
      tint
    )

  header()
  if (r.openingBalance && first)
    drawRow({
      date: { text: day(first.entryDate) },
      remark: { text: "Opening balance", bold: true },
      bal: { text: amount(r.openingBalance), bold: true },
    })
  for (const e of d.entries)
    drawRow({
      date: { text: day(e.entryDate), sub: clock(e.entryTime) },
      remark: {
        text: e.remark ?? "",
        sub:
          d.book.fields.category && e.categoryName ? e.categoryName : undefined,
      },
      contact: { text: e.contactName ?? "" },
      mode: { text: e.modeName ?? "" },
      in: e.type === "in" ? { text: amount(e.amount), color: IN } : undefined,
      out:
        e.type === "out" ? { text: amount(e.amount), color: OUT } : undefined,
      bal: { text: amount(e.balance) },
    })
  if (!d.entries.length)
    drawRow({ remark: { text: "No entries in this period.", color: MUTED } })
  drawRow(
    {
      date: { text: to ? day(to) : "", bold: true },
      remark: { text: "Final balance", bold: true },
      in: { text: amount(r.totalIn), color: IN, bold: true },
      out: { text: amount(r.totalOut), color: OUT, bold: true },
      bal: {
        text: amount(r.closingBalance),
        color: r.closingBalance < 0 ? OUT : INK,
        bold: true,
      },
    },
    tint
  )

  // ── Footer on every page ────────────────────────────────────────────────
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    const fy = doc.page.height - 36
    doc
      .moveTo(left, fy - 8)
      .lineTo(left + width, fy - 8)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke()
    write(
      "Generated by Billleaf · billleaf.com",
      left,
      fy,
      {
        lineBreak: false,
      },
      { size: 8, color: MUTED }
    )
    write(
      `Page ${i - range.start + 1} of ${range.count}`,
      left,
      fy,
      { width, align: "right", lineBreak: false },
      { size: 8, color: MUTED }
    )
    doc.page.margins.bottom = margin
  }
  doc.end()
  return done
}

/** "May 2026" for a whole calendar month, a range otherwise, null for all. */
export function periodLabel(
  from: string | null,
  to: string | null,
  locale: string
): string | null {
  if (!from && !to) return null
  if (
    from &&
    to &&
    from.slice(0, 7) === to.slice(0, 7) &&
    from.endsWith("-01")
  ) {
    const [y, m] = from.split("-").map(Number)
    const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
    if (Number(to.slice(8)) === lastDay)
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${from}T00:00:00Z`))
  }
  if (from && to && from === to)
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${from}T00:00:00Z`))
  return null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    (parts.length > 1
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
      : (parts[0]?.slice(0, 2) ?? "B")
    ).toUpperCase() || "B"
  )
}

function validHex(c: string | null): string | null {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : null
}

/** `a` blended toward `b` by `t` (0 = a, 1 = b). */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i]! - v) * t)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}
