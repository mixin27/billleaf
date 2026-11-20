import { describe, expect, it } from "vitest"

import { reminderAt, reminderBody } from "./reminder-schedule"

describe("reminderAt", () => {
  it("is the chosen hours after the start", () => {
    expect(reminderAt({ startedAt: "2026-11-19T01:00:00.000Z" }, 8)).toBe(
      Date.parse("2026-11-19T09:00:00.000Z")
    )
    expect(reminderAt({ startedAt: "2026-11-19T22:00:00.000Z" }, 4)).toBe(
      Date.parse("2026-11-20T02:00:00.000Z")
    )
  })
})

describe("reminderBody", () => {
  it("names the work, the project and the hours", () => {
    expect(
      reminderBody({ description: " Wireframes ", projectName: "Website" }, 8)
    ).toBe(
      "“Wireframes” on Website has been running for 8 hours. Stop it if you're done."
    )
    expect(reminderBody({ description: "", projectName: null }, 6)).toBe(
      "Your timer has been running for 6 hours. Stop it if you're done."
    )
  })
})
