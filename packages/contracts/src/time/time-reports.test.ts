import { describe, expect, it } from "vitest"

import { summaryReportQuerySchema } from "./time-reports.schema"

const base = { from: "2026-01-01", to: "2026-01-31" }
const id = "0b9f5a3e-6f1c-4c8e-9a7d-2f4b8c1d3e5a"

describe("report member filter", () => {
  it("takes me, an id or a list, as a list", () => {
    expect(
      summaryReportQuerySchema.parse({ ...base, memberId: "me" }).memberId
    ).toEqual(["me"])
    expect(
      summaryReportQuerySchema.parse({ ...base, memberId: id }).memberId
    ).toEqual([id])
    expect(
      summaryReportQuerySchema.parse({ ...base, memberId: ["me", id] }).memberId
    ).toEqual(["me", id])
  })

  it("rejects anything else", () => {
    expect(
      summaryReportQuerySchema.safeParse({ ...base, memberId: "you" }).success
    ).toBe(false)
  })
})
