import { describe, expect, it } from "vitest"

import { periodBars, periodRange } from "./home"

describe("periodRange", () => {
  it("runs a week Monday to Sunday", () => {
    expect(periodRange("week", "2026-11-28")).toEqual({
      from: "2026-11-23",
      to: "2026-11-29",
    })
  })
  it("covers the whole month, leap February too", () => {
    expect(periodRange("month", "2026-11-28")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    })
    expect(periodRange("month", "2028-02-10").to).toBe("2028-02-29")
  })
  it("covers the calendar year", () => {
    expect(periodRange("year", "2026-11-28")).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    })
  })
})

describe("periodBars", () => {
  const byDay = [
    { date: "2026-11-23", seconds: 3600 },
    { date: "2026-11-28", seconds: 1800 },
    { date: "2026-03-02", seconds: 600 },
  ]
  it("gives seven days for a week, marking today and the future", () => {
    const bars = periodBars("week", "2026-11-28", byDay, "en")
    expect(bars.map((b) => b.label)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ])
    expect(bars[0]!.seconds).toBe(3600)
    expect(bars[5]).toMatchObject({ seconds: 1800, current: true })
    expect(bars[6]!.future).toBe(true)
  })
  it("sums a year by month", () => {
    const bars = periodBars("year", "2026-11-28", byDay, "en")
    expect(bars).toHaveLength(12)
    expect(bars[2]!.seconds).toBe(600)
    expect(bars[10]).toMatchObject({ seconds: 5400, current: true })
    expect(bars[11]!.future).toBe(true)
  })
  it("labels every fifth day of a month", () => {
    const bars = periodBars("month", "2026-11-28", byDay, "en")
    expect(bars).toHaveLength(30)
    expect(bars[0]!.label).toBe("1")
    expect(bars[1]!.label).toBe("")
    expect(bars[4]!.label).toBe("5")
  })
})
