import { describe, expect, it } from "vitest"

import { initials, shortDate } from "./format"

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

describe("initials", () => {
  it("takes the first letters of the first two names", () => {
    expect(initials("Ada Lovelace")).toBe("AL")
    expect(initials("  mary  ann  smith ")).toBe("MA")
    expect(initials("Cher")).toBe("C")
  })
  it("falls back to the email, then a question mark", () => {
    expect(initials("", "ben@example.test")).toBe("B")
    expect(initials(undefined)).toBe("?")
  })
})
