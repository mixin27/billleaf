import { MANUAL_GRACE_DAYS } from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { reminderStage } from "./subscription-reminders.service.js"

const day = 86_400_000
const now = new Date("2026-11-15T12:00:00Z")
const end = (days: number) => new Date(now.getTime() + days * day)

describe("reminderStage", () => {
  it("is quiet more than a week before the end", () => {
    expect(reminderStage(end(8), now)).toBeNull()
  })

  it("reminds a week before, then the day before", () => {
    expect(reminderStage(end(7), now)).toBe("7d")
    expect(reminderStage(end(2), now)).toBe("7d")
    expect(reminderStage(end(1), now)).toBe("1d")
    expect(reminderStage(end(0.1), now)).toBe("1d")
  })

  it("says it ended during the grace period, then stops", () => {
    expect(reminderStage(end(0), now)).toBe("ended")
    expect(reminderStage(end(-MANUAL_GRACE_DAYS + 0.5), now)).toBe("ended")
    expect(reminderStage(end(-MANUAL_GRACE_DAYS - 0.5), now)).toBeNull()
  })
})
