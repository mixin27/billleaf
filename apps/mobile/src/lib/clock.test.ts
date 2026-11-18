import { describe, expect, it } from "vitest"

import { elapsedSeconds, formatClock } from "./clock"

describe("formatClock", () => {
  it("pads minutes and seconds, not hours", () => {
    expect(formatClock(0)).toBe("0:00:00")
    expect(formatClock(59)).toBe("0:00:59")
    expect(formatClock(3725)).toBe("1:02:05")
    expect(formatClock(36_000)).toBe("10:00:00")
  })

  it("floors fractions and clamps negatives", () => {
    expect(formatClock(61.9)).toBe("0:01:01")
    expect(formatClock(-5)).toBe("0:00:00")
  })
})

describe("elapsedSeconds", () => {
  const start = "2026-11-18T09:00:00.000Z"
  it("counts whole seconds since the start", () => {
    expect(elapsedSeconds(start, Date.parse(start) + 90_500)).toBe(90)
  })
  it("is never negative (clock skew)", () => {
    expect(elapsedSeconds(start, Date.parse(start) - 5_000)).toBe(0)
  })
})
