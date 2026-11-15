/** Offset of `timeZone` from UTC at instant `ts`, in ms (local − UTC). */
function offsetAt(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts))
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const local = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second")
  )
  return local - Math.floor(ts / 1000) * 1000
}

/**
 * Wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:MM[:SS]") in `timeZone` →
 * the UTC instant. In a DST gap the time is shifted forward, like most apps.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number]
  const [hh = 0, mm = 0, ss = 0] = time.split(":").map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss)
  const first = offsetAt(wall, timeZone)
  let ts = wall - first
  const second = offsetAt(ts, timeZone)
  if (second !== first) ts = wall - second
  return new Date(ts)
}

/** Local "YYYY-MM-DD" and "HH:MM:SS" of an instant in `timeZone`. */
export function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at)
  const v = (t: string) => parts.find((p) => p.type === t)!.value
  return {
    date: `${v("year")}-${v("month")}-${v("day")}`,
    time: `${v("hour")}:${v("minute")}:${v("second")}`,
  }
}
