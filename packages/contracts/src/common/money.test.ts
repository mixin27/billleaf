import { describe, expect, it } from "vitest"

import {
  currencyDigits,
  displayDigits,
  formatMoney,
  fromMinorUnits,
  toMinorUnits,
} from "./money.js"

describe("currency digits", () => {
  it("stores MMK in pya, like ISO 4217, but shows it whole", () => {
    expect(currencyDigits("MMK")).toBe(2)
    expect(displayDigits("MMK")).toBe(0)
  })

  it("leaves other currencies as ISO 4217 has them", () => {
    expect(displayDigits("USD")).toBe(2)
    expect(displayDigits("JPY")).toBe(0)
    expect(currencyDigits("JPY")).toBe(0)
  })
})

/** Intl separates the currency code with a no-break space. */
const plain = (s: string) => s.replace(/\u00a0/g, " ")

describe("formatMoney", () => {
  it("shows MMK without decimals", () => {
    expect(plain(formatMoney({ amount: 5_000_000, currency: "MMK" }))).toBe(
      "MMK 50,000"
    )
  })

  it("rounds a stray pya amount to the nearest kyat", () => {
    expect(plain(formatMoney({ amount: 5_000_050, currency: "MMK" }))).toBe(
      "MMK 50,001"
    )
  })

  it("keeps cents for USD", () => {
    expect(formatMoney({ amount: 1250, currency: "USD" })).toBe("$12.50")
    expect(formatMoney({ amount: 120_000, currency: "USD" })).toBe("$1,200.00")
  })
})

describe("toMinorUnits", () => {
  it("reads whole kyat into pya", () => {
    expect(toMinorUnits("50,000", "MMK")).toBe(5_000_000)
    expect(toMinorUnits("50000.00", "MMK")).toBe(5_000_000)
  })

  it("rejects fractions of a kyat", () => {
    expect(toMinorUnits("50000.5", "MMK")).toBeNull()
  })

  it("reads USD as before", () => {
    expect(toMinorUnits("12.5", "USD")).toBe(1250)
    expect(toMinorUnits("12.50", "USD")).toBe(1250)
    expect(toMinorUnits("-3", "USD")).toBe(-300)
    expect(toMinorUnits("12.505", "USD")).toBeNull()
    expect(toMinorUnits("abc", "USD")).toBeNull()
  })
})

describe("fromMinorUnits", () => {
  it("gives whole kyat for inputs", () => {
    expect(fromMinorUnits(5_000_000, "MMK")).toBe("50000")
  })

  it("keeps two decimals for USD", () => {
    expect(fromMinorUnits(1250, "USD")).toBe("12.50")
    expect(fromMinorUnits(5, "USD")).toBe("0.05")
    expect(fromMinorUnits(-300, "USD")).toBe("-3.00")
  })

  it("round-trips with toMinorUnits", () => {
    for (const [amount, currency] of [
      [5_000_000, "MMK"],
      [1250, "USD"],
      [900, "JPY"],
    ] as const)
      expect(toMinorUnits(fromMinorUnits(amount, currency), currency)).toBe(
        amount
      )
  })
})
