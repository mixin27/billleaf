import { describe, expect, it } from "vitest"

import {
  dayHeading,
  durationRange,
  groupByDay,
  normalizeClock,
  timeLabel,
} from "./cashbook"

describe("durationRange", () => {
  const today = "2026-03-10"
  it("covers today, yesterday and the months", () => {
    expect(durationRange("today", today)).toEqual({ from: today, to: today })
    expect(durationRange("yesterday", today)).toEqual({
      from: "2026-03-09",
      to: "2026-03-09",
    })
    expect(durationRange("this_month", today)).toEqual({
      from: "2026-03-01",
      to: today,
    })
    expect(durationRange("last_month", today)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    })
    expect(durationRange("last_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    })
    expect(durationRange("all", today)).toEqual({})
  })
})

describe("labels", () => {
  it("formats times and day headings", () => {
    expect(timeLabel("16:10", "en-US")).toBe("4:10 pm")
    expect(dayHeading("2026-03-10", "en-GB", "2026-03-10")).toBe(
      "Today, 10 Mar"
    )
    expect(dayHeading("2026-03-09", "en-GB", "2026-03-10")).toBe(
      "Yesterday, 9 Mar"
    )
    expect(dayHeading("2025-12-01", "en-GB", "2026-03-10")).toBe(
      "Mon, 1 Dec 2025"
    )
  })
})

describe("groupByDay", () => {
  it("keeps order and groups runs of the same date", () => {
    const g = groupByDay([
      { entryDate: "2026-03-10", id: 1 },
      { entryDate: "2026-03-10", id: 2 },
      { entryDate: "2026-03-08", id: 3 },
    ])
    expect(g.map((s) => [s.date, s.data.length])).toEqual([
      ["2026-03-10", 2],
      ["2026-03-08", 1],
    ])
  })
})

describe("normalizeClock", () => {
  it("accepts 24-hour times", () => {
    expect(normalizeClock("9:05")).toBe("09:05")
    expect(normalizeClock("23:59")).toBe("23:59")
    expect(normalizeClock("24:00")).toBeNull()
    expect(normalizeClock("4:10 pm")).toBeNull()
  })
})
