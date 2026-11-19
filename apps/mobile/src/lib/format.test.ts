import { describe, expect, it } from "vitest"

import { shortDate } from "./format"

describe("shortDate", () => {
  it("leaves out the year in the current year", () => {
    expect(shortDate("2026-11-03", "en-GB", "2026-11-19")).toBe("3 Nov")
  })
  it("adds the year for other years", () => {
    expect(shortDate("2025-12-31", "en-US", "2026-01-02")).toBe("Dec 31, 2025")
  })
  it("never shifts the day with the device time zone", () => {
    expect(shortDate("2026-01-01", "en-GB")).toBe("1 Jan")
  })
})
