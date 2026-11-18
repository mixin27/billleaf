import { describe, expect, it } from "vitest"

import { addDays, weekStart } from "./dates"

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
