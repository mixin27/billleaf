import { createHash } from "node:crypto"

import { toMinorUnits } from "@workspace/contracts"

import { parseCsv } from "../time/clockify-csv.js"

/**
 * The CashBook app's (cashbook.in) CSV export of one book:
 *
 *   "Date","Time","Remark","Entry by","Contact","Mode","Cash In","Cash Out","Balance"
 *   "04 May 2026","12:47 pm","","Aye","Ko Ko","Online",5000000,,5000000
 *
 * Oldest first, amounts in the book's currency, Balance is the running
 * balance after the row. Columns are found by header name, so a book with
 * a Category column (or columns in another order) works too.
 */
export interface CashbookCsvRow {
  /** 1-based line in the file (header = 1). */
  line: number
  entryDate: string
  entryTime: string
  type: "in" | "out"
  /** Minor units of the book's currency. */
  amount: number
  remark: string | null
  contactName: string | null
  mode: string | null
  category: string | null
  entryBy: string | null
  /** The file's running balance after this row, when it has one. */
  balance: number | null
}

export interface ParsedCashbookCsv {
  rows: CashbookCsvRow[]
  invalid: { line: number; message: string }[]
}

export class CashbookCsvFormatError extends Error {}

const COLUMNS = {
  date: ["date"],
  time: ["time"],
  remark: ["remark", "remarks", "description", "details"],
  entryBy: ["entry by", "entered by", "created by"],
  contact: ["contact", "party", "contact name"],
  mode: ["mode", "payment mode"],
  category: ["category"],
  cashIn: ["cash in"],
  cashOut: ["cash out"],
  balance: ["balance"],
} as const

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/** "04 May 2026" (or "4 May, 2026", or 2026-05-04) → "2026-05-04". */
export function parseCashbookDate(v: string): string | null {
  const s = v.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const named = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})$/.exec(s)
  let y: number, m: number, d: number
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (named) {
    const month =
      MONTHS[named[2]!.toLowerCase().slice(0, 4)] ??
      MONTHS[named[2]!.toLowerCase().slice(0, 3)]
    if (!month) return null
    ;[y, m, d] = [Number(named[3]), month, Number(named[1])]
  } else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** "12:47 pm", "5:03 PM", "17:03" → "HH:MM" (24-hour). */
export function parseCashbookTime(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i.exec(v.trim())
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ampm = m[3]?.toLowerCase().replace(/\./g, "")
  if (min > 59) return null
  if (ampm) {
    if (h < 1 || h > 12) return null
    if (ampm === "am" && h === 12) h = 0
    if (ampm === "pm" && h !== 12) h += 12
  } else if (h > 23) return null
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

/** "5,000,000" / "1500.50" → minor units; null when empty or not a number. */
function money(v: string, currency: string): number | null {
  const s = v.trim().replace(/,/g, "")
  if (!s) return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN
  // null: more decimals than the currency has (e.g. 1.5 kyat).
  return toMinorUnits(s, currency) ?? Number.NaN
}

const text = (v: string | undefined) => {
  const s = v?.trim() ?? ""
  return s ? s : null
}

/** Parse the export; throws `CashbookCsvFormatError` when it isn't one. */
export function parseCashbookCsv(
  csv: string,
  currency: string
): ParsedCashbookCsv {
  const table = parseCsv(csv)
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase())
  const col = (names: readonly string[]) =>
    header.findIndex((h) => names.includes(h))
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, names]) => [k, col(names)])
  ) as Record<keyof typeof COLUMNS, number>
  if (idx.date < 0 || idx.cashIn < 0 || idx.cashOut < 0)
    throw new CashbookCsvFormatError(
      "This doesn't look like a CashBook export: it needs Date, Cash In and Cash Out columns"
    )

  const rows: CashbookCsvRow[] = []
  const invalid: ParsedCashbookCsv["invalid"] = []
  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const cell = (k: keyof typeof COLUMNS) =>
      idx[k] >= 0 ? (cells[idx[k]] ?? "") : ""
    const entryDate = parseCashbookDate(cell("date"))
    if (!entryDate)
      return invalid.push({
        line,
        message: `Unreadable date "${cell("date")}"`,
      })
    const rawTime = cell("time")
    const entryTime = rawTime ? parseCashbookTime(rawTime) : "00:00"
    if (!entryTime)
      return invalid.push({ line, message: `Unreadable time "${rawTime}"` })
    const cashIn = money(cell("cashIn"), currency)
    const cashOut = money(cell("cashOut"), currency)
    if (Number.isNaN(cashIn) || Number.isNaN(cashOut))
      return invalid.push({ line, message: "Unreadable amount" })
    const hasIn = cashIn !== null && cashIn !== 0
    const hasOut = cashOut !== null && cashOut !== 0
    if (hasIn === hasOut)
      return invalid.push({
        line,
        message: hasIn
          ? "Both Cash In and Cash Out are filled"
          : "No amount in Cash In or Cash Out",
      })
    const amount = (hasIn ? cashIn : cashOut)!
    if (amount < 0)
      return invalid.push({ line, message: "Amounts must be positive" })
    const balance = money(cell("balance"), currency)
    rows.push({
      line,
      entryDate,
      entryTime,
      type: hasIn ? "in" : "out",
      amount,
      remark: text(cell("remark")),
      contactName: text(cell("contact")),
      mode: text(cell("mode")),
      category: text(cell("category")),
      entryBy: text(cell("entryBy")),
      balance: balance === null || Number.isNaN(balance) ? null : balance,
    })
  })
  return { rows, invalid }
}

/**
 * Stable fingerprints for the rows, so importing the same file again adds
 * nothing. Identical rows in one file (two equal sales in the same minute)
 * stay apart by their occurrence number.
 */
export function importKeys(rows: CashbookCsvRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = [
      "cashbook.in",
      r.entryDate,
      r.entryTime,
      r.type,
      r.amount,
      r.remark ?? "",
      (r.contactName ?? "").toLowerCase(),
      (r.mode ?? "").toLowerCase(),
      (r.category ?? "").toLowerCase(),
      (r.entryBy ?? "").toLowerCase(),
    ].join("\u001f")
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return createHash("sha256").update(`${base}\u001f${n}`).digest("hex")
  })
}
