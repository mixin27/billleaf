/**
 * Wall-clock helpers for a named time zone (the workspace's), so the
 * calendar's days and hours match the dates entries are filed under,
 * whatever zone the browser is in.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    formatters.set(tz, f)
  }
  return f
}

function wall(ms: number, tz: string) {
  const p: Record<string, string> = {}
  for (const part of formatter(tz).formatToParts(new Date(ms)))
    p[part.type] = part.value
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

/** Offset of `tz` from UTC at instant `ms`, in milliseconds. */
function offset(ms: number, tz: string) {
  const w = wall(ms, tz)
  const asUtc = Date.parse(
    `${w.date}T${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}:${String(w.second).padStart(2, "0")}Z`
  )
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** Local date and minutes since local midnight of an instant in `tz`. */
export function zonedParts(iso: string | number | Date, tz: string) {
  const ms = new Date(iso).getTime()
  const w = wall(ms, tz)
  return { date: w.date, minutes: w.hour * 60 + w.minute + w.second / 60 }
}

/**
 * The instant at `minutes` past local midnight of `date` in `tz` (minutes may
 * be ≥ 1440 for the next day). In a DST gap it lands just after the gap.
 */
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const guess = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000
  const a = guess - offset(guess, tz)
  const b = guess - offset(a, tz)
  const matches = (ms: number) => ms + offset(ms, tz) === guess
  if (matches(a)) return new Date(a)
  if (matches(b)) return new Date(b)
  // In a DST gap that wall time doesn't exist: use the instant after it.
  return new Date(Math.max(a, b))
}

/** "09:30" from minutes since midnight. */
export function hhmm(minutes: number) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Minutes since midnight from "HH:MM", or null. */
export function parseHhmm(v: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
