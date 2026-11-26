import { addDays } from "@workspace/contracts"

/** YYYY-MM-DD and HH:MM now in a timezone (the workspace's). */
export function nowIn(timeZone: string | undefined, now = new Date()) {
  const tz = timeZone || undefined
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now)
  return { date, time }
}

/** Date shortcuts on a book, as in the CashBook app. */
export const DURATIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
] as const
export type Duration = (typeof DURATIONS)[number]["value"] | "custom"

/** `today` is YYYY-MM-DD in the workspace timezone. */
export function durationRange(
  d: Duration,
  today: string,
  custom?: { from?: string; to?: string }
): { from?: string; to?: string } {
  switch (d) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const y = addDays(today, -1)
      return { from: y, to: y }
    }
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case "last_month": {
      const firstThis = `${today.slice(0, 7)}-01`
      const lastPrev = addDays(firstThis, -1)
      return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev }
    }
    case "custom":
      return { from: custom?.from, to: custom?.to }
    default:
      return {}
  }
}

/** "14:05" → "2:05 pm" (or the locale's own clock). */
export function timeLabel(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)))
    .toLowerCase()
}

/** "Today, 26 Nov", "Yesterday, 25 Nov", "Mon, 3 Nov 2025". */
export function dayHeading(iso: string, locale: string, today?: string) {
  const sameYear = !today || today.slice(0, 4) === iso.slice(0, 4)
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`))
  if (today && iso === today) return `Today, ${date}`
  if (today && iso === addDays(today, -1)) return `Yesterday, ${date}`
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`))
  return `${weekday}, ${date}`
}

/** Consecutive items with the same date → sections (input is newest first). */
export function groupByDay<T extends { entryDate: string }>(
  items: T[]
): { date: string; data: T[] }[] {
  const out: { date: string; data: T[] }[] = []
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && last.date === item.entryDate) last.data.push(item)
    else out.push({ date: item.entryDate, data: [item] })
  }
  return out
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** "9:05" or "09:05" → "09:05"; null when it isn't a 24-hour time. */
export function normalizeClock(input: string): string | null {
  const m = HHMM.exec(input.trim())
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : null
}

/** Book names offered when you create one. */
export const BOOK_NAME_IDEAS = ["Shop", "Home", "Personal", "Project"] as const
