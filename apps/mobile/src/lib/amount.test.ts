import { describe, expect, it } from "vitest"

import { normalizeAmount } from "./amount"

describe("normalizeAmount", () => {
  it("keeps plain and dot-decimal amounts", () => {
    expect(normalizeAmount("18")).toBe("18")
    expect(normalizeAmount("18.40")).toBe("18.40")
    expect(normalizeAmount(" 18.4 ")).toBe("18.4")
  })

  it("reads a decimal-pad comma as the decimal point", () => {
    expect(normalizeAmount("18,40")).toBe("18.40")
    expect(normalizeAmount("18,4")).toBe("18.4")
    expect(normalizeAmount("0,99")).toBe("0.99")
  })

  it("treats a comma with three digits after it as grouping", () => {
    expect(normalizeAmount("1,234")).toBe("1234")
    expect(normalizeAmount("1,234,567")).toBe("1234567")
  })

  it("uses the last separator as the decimal point when both appear", () => {
    expect(normalizeAmount("1,234.56")).toBe("1234.56")
    expect(normalizeAmount("1.234,56")).toBe("1234.56")
  })

  it("drops spaces used for grouping", () => {
    expect(normalizeAmount("1 234,56")).toBe("1234.56")
    expect(normalizeAmount("1 234,56")).toBe("1234.56")
  })
})
