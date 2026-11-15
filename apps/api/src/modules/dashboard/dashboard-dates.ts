/** Calendar helpers on YYYY-MM-DD strings (no timezone shifts). */
export function monthStart(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

export function shiftMonth(isoMonthStart: string, delta: number): string {
  const [y, m] = isoMonthStart.split("-").map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  return d.toISOString().slice(0, 10)
}

export function lastDayOfMonth(isoMonthStart: string): string {
  const next = new Date(`${shiftMonth(isoMonthStart, 1)}T00:00:00Z`)
  next.setUTCDate(0)
  return next.toISOString().slice(0, 10)
}

/** The `count` month keys (YYYY-MM) ending with the month of `isoDate`. */
export function lastMonths(isoDate: string, count: number): string[] {
  const start = monthStart(isoDate)
  return Array.from({ length: count }, (_, i) =>
    shiftMonth(start, i - (count - 1)).slice(0, 7)
  )
}
