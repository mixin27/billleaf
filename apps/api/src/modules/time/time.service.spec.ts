import {
  amountForSeconds,
  formatDuration,
  secondsToHours,
} from "@workspace/contracts"
import { describe, expect, it } from "vitest"

import { groupLines } from "./time.service.js"

describe("time math", () => {
  it("rounds seconds to billable hours (2 decimals, half-up)", () => {
    expect(secondsToHours(3600)).toBe(1)
    expect(secondsToHours(5400)).toBe(1.5)
    expect(secondsToHours(17)).toBe(0) // < 18 s rounds to 0.00
    expect(secondsToHours(18)).toBe(0.01)
    expect(formatDuration(3_900)).toBe("1:05")
  })

  it("prices unbilled time exactly like an invoice line", () => {
    expect(amountForSeconds(5_400, 9_000)).toBe(13_500) // 1.5 h × 90.00
  })

  it("groups entries into one line per task and rate with a date range", () => {
    const lines = groupLines(
      [
        {
          id: "a",
          taskId: "t1",
          taskTitle: "Design",
          durationSeconds: 3_600,
          entryDate: "2026-11-02",
          rate: 9_000,
        },
        {
          id: "b",
          taskId: null,
          taskTitle: null,
          durationSeconds: 1_800,
          entryDate: "2026-11-03",
          rate: 9_000,
        },
        {
          id: "c",
          taskId: "t1",
          taskTitle: "Design",
          durationSeconds: 1_800,
          entryDate: "2026-11-05",
          rate: 9_000,
        },
        {
          id: "d",
          taskId: "t1",
          taskTitle: "Design",
          durationSeconds: 900,
          entryDate: "2026-11-04",
          rate: 6_000,
        },
      ],
      "Website"
    )
    expect(lines).toEqual([
      {
        description: "Design (2026-11-02 – 2026-11-05)",
        seconds: 5_400,
        rate: 9_000,
        entryIds: ["a", "c"],
      },
      {
        description: "Website (2026-11-03)",
        seconds: 1_800,
        rate: 9_000,
        entryIds: ["b"],
      },
      {
        description: "Design (2026-11-04)",
        seconds: 900,
        rate: 6_000,
        entryIds: ["d"],
      },
    ])
  })
})
