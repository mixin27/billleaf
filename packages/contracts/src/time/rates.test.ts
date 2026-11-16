import { describe, expect, it } from "vitest"

import {
  amountForSeconds,
  budgetThreshold,
  resolveHourlyRate,
} from "./rates.schema.js"

const base = {
  billing: "hourly",
  currency: "USD",
  projectRate: null,
  taskRate: null,
  member: { currency: "USD", hourlyRate: 7_000 },
  workspace: { currency: "USD", hourlyRate: 5_000 },
}

describe("resolveHourlyRate", () => {
  it("prefers task, then project, then member, then workspace", () => {
    expect(
      resolveHourlyRate({ ...base, taskRate: 12_000, projectRate: 9_000 })
    ).toEqual({ rate: 12_000, source: "task" })
    expect(resolveHourlyRate({ ...base, projectRate: 9_000 })).toEqual({
      rate: 9_000,
      source: "project",
    })
    expect(resolveHourlyRate(base)).toEqual({ rate: 7_000, source: "member" })
    expect(resolveHourlyRate({ ...base, member: null })).toEqual({
      rate: 5_000,
      source: "workspace",
    })
  })

  it("skips member and workspace rates in another currency", () => {
    expect(resolveHourlyRate({ ...base, currency: "EUR" })).toBeNull()
    expect(
      resolveHourlyRate({
        ...base,
        member: { currency: "EUR", hourlyRate: 7_000 },
      })
    ).toEqual({ rate: 5_000, source: "workspace" })
  })

  it("has no rate unless the project is hourly", () => {
    expect(resolveHourlyRate({ ...base, billing: "fixed" })).toBeNull()
    expect(
      resolveHourlyRate({ ...base, billing: "non_billable", taskRate: 1 })
    ).toBeNull()
  })

  it("treats a zero rate as set", () => {
    expect(resolveHourlyRate({ ...base, taskRate: 0 })).toEqual({
      rate: 0,
      source: "task",
    })
  })
})

describe("budgets", () => {
  it("prices time like invoice lines", () => {
    expect(amountForSeconds(5_400, 9_000)).toBe(13_500)
  })

  it("reports the highest threshold reached", () => {
    expect(budgetThreshold(79, 100)).toBeNull()
    expect(budgetThreshold(80, 100)).toBe(80)
    expect(budgetThreshold(130, 100)).toBe(100)
    expect(budgetThreshold(5, 0)).toBeNull()
  })
})
