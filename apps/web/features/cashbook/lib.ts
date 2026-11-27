import {
  addDays,
  type Cashbook,
  type CashbookEntryType,
  type CashbookFilter,
} from "@workspace/contracts"

/** Date shortcuts on a book, as in the CashBook app (and the mobile app). */
export const DURATIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
] as const
export type Duration = (typeof DURATIONS)[number]["value"]
export const DURATION_VALUES = DURATIONS.map((d) => d.value)

/** `today` is YYYY-MM-DD in the workspace timezone. */
export function durationRange(
  d: Duration,
  today: string,
  custom?: { from?: string | null; to?: string | null }
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
      return {
        ...(custom?.from ? { from: custom.from } : {}),
        ...(custom?.to ? { to: custom.to } : {}),
      }
    default:
      return {}
  }
}

/** The book page's filters (from the URL) as the API wants them. */
export function toApiFilter(
  f: {
    duration: Duration
    from?: string | null
    to?: string | null
    type?: CashbookEntryType | null
    categoryId?: string | null
    modeId?: string | null
    memberId?: string | null
    q?: string | null
  },
  today: string
): CashbookFilter {
  const out: CashbookFilter = durationRange(f.duration, today, f)
  if (f.type) out.type = f.type
  if (f.categoryId) out.categoryId = f.categoryId
  if (f.modeId) out.modeId = f.modeId
  if (f.memberId) out.memberId = f.memberId
  if (f.q?.trim()) out.q = f.q.trim()
  return out
}

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

/** "14:05" → "2:05 pm" (or the locale's own clock). */
export function timeLabel(hhmm: string, locale?: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)))
    .toLowerCase()
}

/** "2h ago", "3d ago", "just now". */
export function updatedAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "No entries yet"
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return "Updated just now"
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `Updated ${Math.floor(s / 3600)}h ago`
  if (s < 30 * 86_400) return `Updated ${Math.floor(s / 86_400)}d ago`
  return `Updated ${Math.floor(s / (30 * 86_400))}mo ago`
}

/** Book names offered when you create one. */
export const BOOK_NAME_IDEAS = ["Shop", "Home", "Personal", "Project"] as const

/** What your role in a book lets you do (the API enforces it too). */
export const can = {
  addEntries: (b?: Cashbook) =>
    Boolean(b && !b.archivedAt && b.role !== "viewer"),
  manage: (b?: Cashbook) =>
    Boolean(b && (b.role === "admin" || b.role === "owner")),
  own: (b?: Cashbook) => b?.role === "owner",
}
