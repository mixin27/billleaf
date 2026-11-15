import { createHash } from "node:crypto"

/** RFC 4180 CSV → rows of cells (quotes, "" escapes, CRLF, BOM). */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === "") quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""))
}

export type DateFormat = "MDY" | "DMY" | "YMD"

export interface ClockifyRow {
  /** 1-based line in the file (header = 1). */
  line: number
  project: string | null
  client: string | null
  description: string | null
  task: string | null
  user: string | null
  email: string | null
  tags: string[]
  billable: boolean
  /** Wall-clock times, interpreted in the workspace time zone. */
  startDate: string
  startTime: string
  endDate: string
  endTime: string
}

export interface ParsedClockify {
  rows: ClockifyRow[]
  invalid: { line: number; message: string }[]
  dateFormat: DateFormat
}

const COLUMNS = {
  project: ["project"],
  client: ["client"],
  description: ["description"],
  task: ["task"],
  user: ["user"],
  email: ["email"],
  tags: ["tags", "tag"],
  billable: ["billable"],
  startDate: ["start date"],
  startTime: ["start time"],
  endDate: ["end date"],
  endTime: ["end time"],
  duration: ["duration (h)", "duration"],
  durationDecimal: ["duration (decimal)"],
} as const

export class ClockifyFormatError extends Error {}

/** Clockify "Detailed report" CSV → rows with wall-clock times. */
export function parseClockifyCsv(
  text: string,
  dateFormat: DateFormat | "auto" = "auto"
): ParsedClockify {
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0)
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ","
  const [header, ...body] = parseCsv(text, delimiter)
  if (!header) throw new ClockifyFormatError("The file is empty")
  const names = header.map((h) => h.trim().toLowerCase())
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, aliases]) => [
      k,
      names.findIndex((n) => (aliases as readonly string[]).includes(n)),
    ])
  ) as Record<keyof typeof COLUMNS, number>
  if (col.startDate < 0 || col.startTime < 0)
    throw new ClockifyFormatError(
      "This doesn't look like a Clockify detailed report: no Start Date / Start Time columns"
    )
  if ((col.endDate < 0 || col.endTime < 0) && col.duration < 0)
    throw new ClockifyFormatError(
      "The file needs End Date / End Time or Duration columns"
    )

  const get = (r: string[], k: keyof typeof COLUMNS) =>
    col[k] >= 0 ? (r[col[k]] ?? "").trim() : ""
  const opt = (v: string) => (v === "" ? null : v)

  const format =
    dateFormat === "auto"
      ? guessDateFormat(
          body.flatMap((r) => [get(r, "startDate"), get(r, "endDate")])
        )
      : dateFormat

  const rows: ClockifyRow[] = []
  const invalid: ParsedClockify["invalid"] = []
  body.forEach((r, i) => {
    const line = i + 2
    try {
      const startDate = parseDate(get(r, "startDate"), format)
      const startTime = parseTime(get(r, "startTime"))
      let endDate: string
      let endTime: string
      if (get(r, "endDate") && get(r, "endTime")) {
        endDate = parseDate(get(r, "endDate"), format)
        endTime = parseTime(get(r, "endTime"))
      } else {
        const seconds =
          parseDurationCell(get(r, "duration")) ??
          parseDecimalHours(get(r, "durationDecimal"))
        if (!seconds) throw new Error("Missing end time and duration")
        const end = new Date(
          Date.parse(`${startDate}T${startTime}Z`) + seconds * 1000
        ).toISOString()
        endDate = end.slice(0, 10)
        endTime = end.slice(11, 19)
      }
      if (`${endDate}T${endTime}` <= `${startDate}T${startTime}`)
        throw new Error("End is not after start")
      rows.push({
        line,
        project: opt(get(r, "project")),
        client: opt(get(r, "client")),
        description: opt(get(r, "description")),
        task: opt(get(r, "task")),
        user: opt(get(r, "user")),
        email: opt(get(r, "email").toLowerCase()),
        tags: [
          ...new Set(
            get(r, "tags")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          ),
        ],
        billable: /^(yes|true|1|billable)$/i.test(get(r, "billable")),
        startDate,
        startTime,
        endDate,
        endTime,
      })
    } catch (e) {
      invalid.push({ line, message: (e as Error).message })
    }
  })
  return { rows, invalid, dateFormat: format }
}

/** Pick MDY vs DMY from values like 03/14/2026 (YMD when year comes first). */
export function guessDateFormat(values: string[]): DateFormat {
  let dmy = false
  let mdy = false
  for (const v of values) {
    const p = v.split(/[/.-]/)
    if (p.length !== 3) continue
    if (p[0]!.length === 4) return "YMD"
    if (Number(p[0]) > 12) dmy = true
    if (Number(p[1]) > 12) mdy = true
  }
  if (dmy && !mdy) return "DMY"
  return "MDY"
}

export function parseDate(v: string, format: DateFormat): string {
  const p = v.split(/[/.-]/).map((x) => x.trim())
  if (p.length !== 3 || p.some((x) => !/^\d+$/.test(x)))
    throw new Error(`Unreadable date "${v}"`)
  const [a, b, c] = p as [string, string, string]
  const [y, m, d] =
    format === "YMD" || a.length === 4
      ? [a, b, c]
      : format === "DMY"
        ? [c, b, a]
        : [c, a, b]
  const year = y.length === 2 ? `20${y}` : y
  const iso = `${year.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
  const dt = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso)
    throw new Error(`Unreadable date "${v}"`)
  return iso
}

export function parseTime(v: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?$/.exec(
    v.trim()
  )
  if (!m) throw new Error(`Unreadable time "${v}"`)
  let h = Number(m[1])
  const ampm = m[4]?.[0]?.toLowerCase()
  if (ampm) {
    if (h < 1 || h > 12) throw new Error(`Unreadable time "${v}"`)
    h = (h % 12) + (ampm === "p" ? 12 : 0)
  }
  if (h > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59)
    throw new Error(`Unreadable time "${v}"`)
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`
}

/** "1:30:00" → 5400. */
function parseDurationCell(v: string): number | null {
  const m = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(v)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null
}

/** "1.50" or "1,50" → 5400. */
function parseDecimalHours(v: string): number | null {
  const n = Number(v.replace(",", "."))
  return v && Number.isFinite(n) && n > 0 ? Math.round(n * 3600) : null
}

/** Stable fingerprint of a source row (who, when, what). */
export function rowHash(r: {
  who: string
  startedAt: Date
  endedAt: Date
  description: string | null
  project: string | null
  client: string | null
  task: string | null
}): string {
  return createHash("sha256")
    .update(
      [
        "clockify",
        r.who.toLowerCase(),
        r.startedAt.toISOString(),
        r.endedAt.toISOString(),
        r.description ?? "",
        (r.project ?? "").toLowerCase(),
        (r.client ?? "").toLowerCase(),
        (r.task ?? "").toLowerCase(),
      ].join("\u001f")
    )
    .digest("hex")
}
