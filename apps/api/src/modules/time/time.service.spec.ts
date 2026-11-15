import { formatDuration, secondsToHours } from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { groupLines, unbilledAmountFor } from "./time.service.js"

describe("time math", () => {
  it("rounds seconds to billable hours (2 decimals, half-up)", () => {
    expect(secondsToHours(3600)).toBe(1)
    expect(secondsToHours(5400)).toBe(1.5)
    expect(secondsToHours(17)).toBe(0) // < 18 s rounds to 0.00
    expect(secondsToHours(18)).toBe(0.01)
    expect(formatDuration(3_900)).toBe("1:05")
  })

  it("prices unbilled time exactly like an invoice line", () => {
    expect(unbilledAmountFor(5_400, 9_000)).toBe(13_500) // 1.5 h × 90.00
  })

  it("groups entries into one line per task with a date range", () => {
    const lines = groupLines(
      [
        {
          taskId: "t1",
          taskTitle: "Design",
          durationSeconds: 3_600,
          entryDate: "2026-11-02",
        },
        {
          taskId: null,
          taskTitle: null,
          durationSeconds: 1_800,
          entryDate: "2026-11-03",
        },
        {
          taskId: "t1",
          taskTitle: "Design",
          durationSeconds: 1_800,
          entryDate: "2026-11-05",
        },
      ],
      "Website"
    )
    expect(lines).toEqual([
      { description: "Design (2026-11-02 – 2026-11-05)", seconds: 5_400 },
      { description: "Website (2026-11-03)", seconds: 1_800 },
    ])
  })
})
