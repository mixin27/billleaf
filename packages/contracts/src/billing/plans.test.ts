import { describe, expect, it } from "vitest"

import { effectivePlan, PAST_DUE_GRACE_DAYS } from "./plans.js"

const now = new Date("2026-11-15T00:00:00Z")
const day = 86_400_000
const sub = (
  over: Partial<Parameters<typeof effectivePlan>[0] & object> = {}
) => ({
  planKey: "pro",
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date(now.getTime() + 10 * day),
  ...over,
})

describe("effectivePlan", () => {
  it("defaults to free and ignores unknown plans", () => {
    expect(effectivePlan(null, now)).toBe("free")
    expect(effectivePlan(sub({ planKey: "enterprise" }), now)).toBe("free")
  })

  it("keeps the paid plan while active or trialing", () => {
    expect(effectivePlan(sub(), now)).toBe("pro")
    expect(effectivePlan(sub({ status: "trialing" }), now)).toBe("pro")
  })

  it("honours scheduled cancellation until the period ends", () => {
    expect(effectivePlan(sub({ cancelAtPeriodEnd: true }), now)).toBe("pro")
    const ended = new Date(now.getTime() - day)
    expect(
      effectivePlan(
        sub({ cancelAtPeriodEnd: true, currentPeriodEnd: ended }),
        now
      )
    ).toBe("free")
  })

  it("gives past-due subscriptions a grace period", () => {
    const justEnded = new Date(now.getTime() - day)
    expect(
      effectivePlan(
        sub({ status: "past_due", currentPeriodEnd: justEnded }),
        now
      )
    ).toBe("pro")
    const longAgo = new Date(now.getTime() - (PAST_DUE_GRACE_DAYS + 1) * day)
    expect(
      effectivePlan(sub({ status: "past_due", currentPeriodEnd: longAgo }), now)
    ).toBe("free")
  })

  it("drops to free when canceled", () => {
    expect(effectivePlan(sub({ status: "canceled" }), now)).toBe("free")
  })
})
