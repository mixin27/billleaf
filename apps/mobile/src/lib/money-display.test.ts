import { describe, expect, it } from "vitest"

import { signedAmount } from "./money-display"

describe("signedAmount", () => {
  it("shows whole kyat with a sign by direction", () => {
    expect(signedAmount(150_000_00, "MMK", "en-US", "in")).toEqual({
      text: "+150,000",
      tone: "in",
    })
    expect(signedAmount(45_000_00, "MMK", "en-US", "out")).toEqual({
      text: "−45,000",
      tone: "out",
    })
  })

  it("keeps the currency's decimals", () => {
    expect(signedAmount(1250, "USD", "en-US").text).toBe("12.50")
  })

  it("signs balances by value", () => {
    expect(signedAmount(-185_000_00, "MMK", "en-US", "auto")).toEqual({
      text: "−185,000",
      tone: "out",
    })
    expect(signedAmount(2_442_000_00, "MMK", "en-US", "auto")).toEqual({
      text: "2,442,000",
      tone: "default",
    })
  })
})
