import { describe, expect, it } from "vitest"

import { fromMinorUnits, toMinorUnits } from "../common/money.js"
import { documentTotals, lineAmounts } from "./line-items.js"

describe("money conversion", () => {
  it("parses decimal strings to minor units per currency", () => {
    expect(toMinorUnits("12.5", "USD")).toBe(1250)
    expect(toMinorUnits("1,000", "USD")).toBe(100000)
    expect(toMinorUnits("1500", "JPY")).toBe(1500)
    expect(toMinorUnits("1.234", "USD")).toBeNull()
    expect(toMinorUnits("abc", "USD")).toBeNull()
    expect(toMinorUnits("", "USD")).toBeNull()
  })

  it("formats minor units back to input strings", () => {
    expect(fromMinorUnits(1250, "USD")).toBe("12.50")
    expect(fromMinorUnits(5, "USD")).toBe("0.05")
    expect(fromMinorUnits(1500, "JPY")).toBe("1500")
  })
})

describe("line input validation", () => {
  it("accepts up to 3 decimals despite float representation", async () => {
    const { lineItemInputSchema } = await import("./line-items.js")
    const base = { description: "x", unitPrice: 100 }
    expect(
      lineItemInputSchema.safeParse({ ...base, quantity: 1.1 }).success
    ).toBe(true)
    expect(
      lineItemInputSchema.safeParse({ ...base, quantity: 0.333 }).success
    ).toBe(true)
    expect(
      lineItemInputSchema.safeParse({ ...base, quantity: 0.3333 }).success
    ).toBe(false)
  })
})

describe("line math", () => {
  it("multiplies fractional quantities without float drift", () => {
    // 1.5 h × $33.33 = $49.995 → $50.00 (half away from zero)
    expect(
      lineAmounts({ quantity: 1.5, unitPrice: 3333, taxRateBps: 0 }).amount
    ).toBe(5000)
    expect(
      lineAmounts({ quantity: 0.1, unitPrice: 30, taxRateBps: 0 }).amount
    ).toBe(3)
  })

  it("rounds tax per line and sums totals", () => {
    const totals = documentTotals([
      { quantity: 1, unitPrice: 999, taxRateBps: 700 }, // tax 69.93 → 70
      { quantity: 2, unitPrice: 1000, taxRateBps: 0 },
    ])
    expect(totals).toEqual({ subtotal: 2999, taxTotal: 70, total: 3069 })
  })
})
