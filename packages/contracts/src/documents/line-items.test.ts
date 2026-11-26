import { describe, expect, it } from "vitest"

import { fromMinorUnits, toMinorUnits } from "../common/money.js"
import { discountedLines, documentTotals, lineAmounts } from "./line-items.js"

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
    expect(totals).toEqual({
      subtotal: 2999,
      discountTotal: 0,
      taxTotal: 70,
      total: 3069,
    })
  })
})

describe("discount", () => {
  const lines = [
    { quantity: 1, unitPrice: 10_000, taxRateBps: 1_000 }, // 100.00 at 10%
    { quantity: 1, unitPrice: 5_000, taxRateBps: 0 }, // 50.00, no tax
  ]

  it("takes a percentage off before tax, per line", () => {
    // 10% off 150.00 = 15.00, shared 10.00 / 5.00; tax 10% of 90.00 = 9.00
    expect(documentTotals(lines, { type: "percent", value: 1_000 })).toEqual({
      subtotal: 15_000,
      discountTotal: 1_500,
      taxTotal: 900,
      total: 14_400,
    })
  })

  it("shares a fixed amount by line amount", () => {
    // 30.00 off: 20.00 / 10.00; tax 10% of 80.00 = 8.00
    expect(documentTotals(lines, { type: "amount", value: 3_000 })).toEqual({
      subtotal: 15_000,
      discountTotal: 3_000,
      taxTotal: 800,
      total: 12_800,
    })
  })

  it("never discounts more than the subtotal", () => {
    expect(
      documentTotals(lines, { type: "amount", value: 999_999 })
    ).toMatchObject({ discountTotal: 15_000, taxTotal: 0, total: 0 })
  })

  it("gives leftover minor units to the largest remainders, exactly", () => {
    const three = [1, 1, 1].map(() => ({
      quantity: 1,
      unitPrice: 100,
      taxRateBps: 0,
    }))
    const shares = discountedLines(three, { type: "amount", value: 100 }).map(
      (l) => l.discount
    )
    expect(shares).toEqual([34, 33, 33])
    expect(shares.reduce((a, b) => a + b)).toBe(100)
  })

  it("is a no-op without a discount or lines", () => {
    expect(documentTotals([], { type: "percent", value: 1_000 })).toEqual({
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      total: 0,
    })
  })
})
