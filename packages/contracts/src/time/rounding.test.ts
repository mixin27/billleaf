import { describe, expect, it } from "vitest"

import { roundingLabel, roundSeconds } from "./time.schema.js"

describe("roundSeconds", () => {
  const m = 60
  it("leaves time alone when off", () => {
    expect(roundSeconds(7 * m + 5, { mode: "off", minutes: 15 })).toBe(
      7 * m + 5
    )
  })
  it("rounds up to the step", () => {
    const up = { mode: "up", minutes: 15 } as const
    expect(roundSeconds(1, up)).toBe(15 * m)
    expect(roundSeconds(15 * m, up)).toBe(15 * m)
    expect(roundSeconds(15 * m + 1, up)).toBe(30 * m)
  })
  it("rounds to the nearest step, halves up", () => {
    const near = { mode: "nearest", minutes: 6 } as const
    expect(roundSeconds(2 * m + 59, near)).toBe(0)
    expect(roundSeconds(3 * m, near)).toBe(6 * m)
    expect(roundSeconds(10 * m, near)).toBe(12 * m)
  })
  it("rounds down to the step", () => {
    const down = { mode: "down", minutes: 30 } as const
    expect(roundSeconds(29 * m, down)).toBe(0)
    expect(roundSeconds(59 * m, down)).toBe(30 * m)
  })
  it("ignores zero and negative durations", () => {
    expect(roundSeconds(0, { mode: "up", minutes: 15 })).toBe(0)
  })
  it("labels rules", () => {
    expect(roundingLabel({ mode: "up", minutes: 15 })).toBe("Up to 15 min")
    expect(roundingLabel({ mode: "nearest", minutes: 6 })).toBe("Nearest 6 min")
    expect(roundingLabel({ mode: "off", minutes: 15 })).toBe("No rounding")
  })
})
