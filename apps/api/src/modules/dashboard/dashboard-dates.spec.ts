import { describe, expect, it } from "vitest"

import {
  lastDayOfMonth,
  lastMonths,
  monthStart,
  shiftMonth,
} from "./dashboard-dates.js"

describe("dashboard dates", () => {
  it("handles month boundaries and year rollover", () => {
    expect(monthStart("2026-11-15")).toBe("2026-11-01")
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01")
    expect(lastDayOfMonth("2026-02-01")).toBe("2026-02-28")
    expect(lastDayOfMonth("2028-02-01")).toBe("2028-02-29")
    expect(lastMonths("2026-02-10", 6)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ])
  })
})
