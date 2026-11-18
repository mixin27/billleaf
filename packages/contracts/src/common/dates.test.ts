import { describe, expect, it } from "vitest"

import {
  addDays,
  hhmm,
  parseDuration,
  parseHhmm,
  weekStart,
  zonedParts,
  zonedToUtc,
} from "./dates.js"

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-11-18")).toBe("2026-11-16") // Wednesday
    expect(weekStart("2026-11-16")).toBe("2026-11-16") // Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16") // Sunday
  })
  it("crosses month and year boundaries", () => {
    expect(weekStart("2027-01-01")).toBe("2026-12-28")
  })
})

describe("addDays", () => {
  it("adds and subtracts calendar days", () => {
    expect(addDays("2026-11-16", 6)).toBe("2026-11-22")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
  })
  it("ignores DST (works on dates, not instants)", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30")
  })
})

describe("parseDuration", () => {
  it("reads clock, decimal and unit forms", () => {
    expect(parseDuration("1:30")).toBe(90)
    expect(parseDuration("1.5")).toBe(90)
    expect(parseDuration("1h 30m")).toBe(90)
    expect(parseDuration("90m")).toBe(90)
    expect(parseDuration("2h")).toBe(120)
  })
  it("treats a bare number up to 12 as hours, above as minutes", () => {
    expect(parseDuration("3")).toBe(180)
    expect(parseDuration("45")).toBe(45)
  })
  it("rejects nonsense", () => {
    expect(parseDuration("")).toBeNull()
    expect(parseDuration("abc")).toBeNull()
    expect(parseDuration("1:75")).toBeNull()
  })
})

describe("hhmm / parseHhmm", () => {
  it("round-trips clock times", () => {
    expect(hhmm(570)).toBe("09:30")
    expect(hhmm(1440 + 15)).toBe("00:15")
    expect(parseHhmm("09:30")).toBe(570)
    expect(parseHhmm("9:05")).toBe(545)
  })
  it("rejects invalid clock times", () => {
    expect(parseHhmm("24:00")).toBeNull()
    expect(parseHhmm("12:60")).toBeNull()
    expect(parseHhmm("noon")).toBeNull()
  })
})

describe("zonedParts / zonedToUtc", () => {
  it("reads the wall clock in a named zone", () => {
    const p = zonedParts("2026-11-18T03:00:00Z", "Asia/Yangon") // UTC+6:30
    expect(p.date).toBe("2026-11-18")
    expect(p.minutes).toBe(9 * 60 + 30)
  })
  it("turns a wall-clock time back into the instant", () => {
    expect(zonedToUtc("2026-11-18", 570, "Asia/Yangon").toISOString()).toBe(
      "2026-11-18T03:00:00.000Z"
    )
  })
  it("rolls minutes past midnight into the next day", () => {
    expect(zonedToUtc("2026-11-18", 1440 + 60, "UTC").toISOString()).toBe(
      "2026-11-19T01:00:00.000Z"
    )
  })
  it("handles DST: the gap lands after it, the overlap stays valid", () => {
    // 02:30 doesn't exist in New York on 2026-03-08 (clocks jump 2 → 3).
    expect(
      zonedToUtc("2026-03-08", 150, "America/New_York").toISOString()
    ).toBe("2026-03-08T07:30:00.000Z")
    // 09:00 on a normal summer day is UTC-4.
    expect(
      zonedToUtc("2026-07-01", 540, "America/New_York").toISOString()
    ).toBe("2026-07-01T13:00:00.000Z")
  })
})
