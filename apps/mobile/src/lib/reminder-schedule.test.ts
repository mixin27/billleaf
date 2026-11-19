import { describe, expect, it } from "vitest"

import { reminderAt, reminderBody } from "./reminder-schedule"

describe("reminderAt", () => {
  it("is 8 hours after the start", () => {
    expect(reminderAt({ startedAt: "2026-11-19T01:00:00.000Z" })).toBe(
      Date.parse("2026-11-19T09:00:00.000Z")
    )
  })
})

describe("reminderBody", () => {
  it("names the work and project when there are some", () => {
    expect(
      reminderBody({ description: " Wireframes ", projectName: "Website" })
    ).toBe(
      "“Wireframes” on Website has been running for 8 hours. Stop it if you're done."
    )
    expect(reminderBody({ description: "", projectName: null })).toBe(
      "Your timer has been running for 8 hours. Stop it if you're done."
    )
  })
})
