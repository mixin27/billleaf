import { describe, expect, it } from "vitest"

import { addInterval } from "./period.js"

const at = (iso: string) => new Date(iso)

describe("addInterval", () => {
  it("adds months and keeps the time of day", () => {
    expect(addInterval(at("2026-11-15T10:00:00Z"), "month")).toEqual(
      at("2026-12-15T10:00:00Z")
    )
    expect(addInterval(at("2026-11-15T10:00:00Z"), "month", 3)).toEqual(
      at("2027-02-15T10:00:00Z")
    )
  })

  it("clamps to the end of shorter months", () => {
    expect(addInterval(at("2027-01-31T23:59:59Z"), "month")).toEqual(
      at("2027-02-28T23:59:59Z")
    )
    expect(addInterval(at("2028-01-31T00:00:00Z"), "month")).toEqual(
      at("2028-02-29T00:00:00Z")
    )
  })

  it("adds years, clamping Feb 29", () => {
    expect(addInterval(at("2028-02-29T00:00:00Z"), "year")).toEqual(
      at("2029-02-28T00:00:00Z")
    )
    expect(addInterval(at("2026-11-15T00:00:00Z"), "year", 2)).toEqual(
      at("2028-11-15T00:00:00Z")
    )
  })
})
