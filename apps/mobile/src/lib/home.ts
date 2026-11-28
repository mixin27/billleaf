import { addDays, weekStart } from "@workspace/contracts"

/** The periods Home's time card can show. */
export type TimePeriod = "week" | "month" | "year"

export const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
}

/** First and last day (YYYY-MM-DD) of the period that contains `today`. */
export function periodRange(
  period: TimePeriod,
  today: string
): { from: string; to: string } {
  if (period === "week") {
    const from = weekStart(today)
    return { from, to: addDays(from, 6) }
  }
  if (period === "month") {
    const from = `${today.slice(0, 7)}-01`
    const [y, m] = from.split("-").map(Number)
    const next = new Date(Date.UTC(y!, m!, 1))
    return { from, to: addDays(next.toISOString().slice(0, 10), -1) }
  }
  const y = today.slice(0, 4)
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export type Bar = {
  key: string
  /** Under the bar: "M", "1", "Jan". Empty to leave a tick out. */
  label: string
  seconds: number
  /** The day or month `today` is in. */
  current: boolean
  /** Not here yet. */
  future: boolean
}

/**
 * Bars for the chart: a day each for a week or month (month labels every
 * 5th day), a month each for a year.
 */
export function periodBars(
  period: TimePeriod,
  today: string,
  byDay: { date: string; seconds: number }[],
  locale: string
): Bar[] {
  const seconds = new Map(byDay.map((d) => [d.date, d.seconds]))
  const { from, to } = periodRange(period, today)
  if (period === "year") {
    const totals = Array.from({ length: 12 }, () => 0)
    for (const d of byDay) totals[Number(d.date.slice(5, 7)) - 1]! += d.seconds
    const month = Number(today.slice(5, 7)) - 1
    const fmt = new Intl.DateTimeFormat(locale, {
      month: "narrow",
      timeZone: "UTC",
    })
    return totals.map((s, i) => ({
      key: String(i),
      label: fmt.format(new Date(Date.UTC(2000, i, 1))),
      seconds: s,
      current: i === month,
      future: i > month,
    }))
  }
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "narrow",
    timeZone: "UTC",
  })
  const bars: Bar[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = Number(d.slice(8, 10))
    bars.push({
      key: d,
      label:
        period === "week"
          ? weekday.format(new Date(`${d}T00:00:00Z`))
          : day === 1 || day % 5 === 0
            ? String(day)
            : "",
      seconds: seconds.get(d) ?? 0,
      current: d === today,
      future: d > today,
    })
  }
  return bars
}
