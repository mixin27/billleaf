import { describe, expect, it } from "vitest"

import { dueReminder } from "./invoice-reminders.service.js"

const base = {
  offsets: [-3, 0, 7],
  dueDate: "2026-11-20",
  issueDate: "2026-11-01",
  sent: [] as number[],
}

describe("dueReminder", () => {
  it("is quiet before the first reminder day", () => {
    expect(dueReminder({ ...base, today: "2026-11-16" })).toBeNull()
  })

  it("sends each reminder on its day", () => {
    expect(dueReminder({ ...base, today: "2026-11-17" })).toBe(-3)
    expect(dueReminder({ ...base, today: "2026-11-20", sent: [-3] })).toBe(0)
    expect(dueReminder({ ...base, today: "2026-11-27", sent: [-3, 0] })).toBe(7)
  })

  it("never repeats one, or goes back to an earlier one", () => {
    expect(dueReminder({ ...base, today: "2026-11-18", sent: [-3] })).toBeNull()
    // Overdue reminder went out; the missed due-day one is skipped for good.
    expect(dueReminder({ ...base, today: "2026-11-28", sent: [7] })).toBeNull()
  })

  it("catches up briefly after downtime, then gives up", () => {
    expect(dueReminder({ ...base, today: "2026-11-22", sent: [-3] })).toBe(0)
    expect(dueReminder({ ...base, today: "2026-11-23", sent: [-3] })).toBeNull()
  })

  it("sends only the latest due one when several are pending", () => {
    expect(dueReminder({ ...base, offsets: [0, 1], today: "2026-11-21" })).toBe(
      1
    )
  })

  it("skips reminders that would fall before the invoice was issued", () => {
    expect(
      dueReminder({ ...base, issueDate: "2026-11-18", today: "2026-11-18" })
    ).toBeNull()
    expect(
      dueReminder({ ...base, issueDate: "2026-11-17", today: "2026-11-17" })
    ).toBeNull()
  })
})
