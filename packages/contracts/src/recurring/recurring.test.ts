import { describe, expect, it } from "vitest"

import { describeRecurrence, nextOccurrence } from "./recurring.schema.js"

describe("nextOccurrence", () => {
  it("keeps the anchor day across short months", () => {
    let d = "2027-01-31"
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      d = nextOccurrence(d, 1, "month", 31)
      seen.push(d)
    }
    expect(seen).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ])
    expect(nextOccurrence("2027-11-30", 3, "month", 30)).toBe("2028-02-29") // leap year
  })

  it("handles weeks and years", () => {
    expect(nextOccurrence("2026-12-28", 2, "week", 28)).toBe("2027-01-11")
    expect(nextOccurrence("2028-02-29", 1, "year", 29)).toBe("2029-02-28")
  })

  it("describes schedules", () => {
    expect(describeRecurrence(1, "month")).toBe("Monthly")
    expect(describeRecurrence(3, "month")).toBe("Quarterly")
    expect(describeRecurrence(2, "week")).toBe("Every 2 weeks")
  })
})
