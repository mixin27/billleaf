import { describe, expect, it } from "vitest"

import { canUse, quickActionsFor } from "./quick-actions"

const me = (permissions: string[], timeTracking = true) => ({
  permissions,
  plan: { features: { timeTracking } },
})
const keys = (a: { key: string }[]) => a.map((x) => x.key)

describe("quickActionsFor", () => {
  it("gives a cashier cash in and out, expenses and a new book", () => {
    expect(
      keys(
        quickActionsFor(
          me(["cashbook.create", "expense.create", "expense.read"]),
          null
        )
      )
    ).toEqual(["cashIn", "cashOut", "expense", "newBook"])
  })

  it("caps the defaults at eight", () => {
    const owner = me([
      "cashbook.create",
      "time.track",
      "time.approve",
      "expense.create",
      "invoice.read",
      "quote.read",
      "client.read",
    ])
    expect(quickActionsFor(owner, null)).toHaveLength(8)
  })

  it("keeps your order and drops what your role no longer allows", () => {
    expect(
      keys(quickActionsFor(me(["time.track"]), ["logTime", "cashIn", "timer"]))
    ).toEqual(["logTime", "timer"])
  })

  it("needs the plan for time actions", () => {
    expect(canUse("timer", me(["time.track"], false))).toBe(false)
  })
})
