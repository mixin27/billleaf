import { describe, expect, it } from "vitest"

import {
  activeSlot,
  canTrackTime,
  miniPlayerPlacement,
  moneyPanes,
  navSlotsFor,
  type NavMe,
} from "./nav"

const me = (permissions: string[], timeTracking = true): NavMe => ({
  permissions,
  plan: { features: { timeTracking } },
})

const OWNER = [
  "cashbook.create",
  "expense.read",
  "time.track",
  "invoice.read",
  "quote.read",
  "contract.read",
  "client.read",
  "project.read",
]

const routes = (s: { route: string }[]) => s.map((x) => x.route)

describe("navSlotsFor", () => {
  it("gives an owner Home · Money · Time · More, with the timer", () => {
    const s = navSlotsFor(me(OWNER))
    expect(routes(s.bar)).toEqual(["index", "expenses", "time", "more"])
    expect(s.bar[1]!.label).toBe("Money")
    expect(s.timer).toBe(true)
  })

  it("puts every destination on the tablet rail", () => {
    expect(routes(navSlotsFor(me(OWNER)).rail)).toEqual([
      "index",
      "expenses",
      "time",
      "invoices",
      "clients",
      "more",
    ])
  })

  it("fills Time's place with Sales when the plan has no time tracking", () => {
    const s = navSlotsFor(me(OWNER, false))
    expect(routes(s.bar)).toEqual(["index", "expenses", "invoices", "more"])
    expect(s.timer).toBe(false)
  })

  it("hides the timer from a role that can't track time", () => {
    const s = navSlotsFor(me(["expense.read", "client.read"]))
    expect(s.timer).toBe(false)
    expect(routes(s.bar)).toEqual(["index", "expenses", "clients", "more"])
    expect(s.bar[1]!.label).toBe("Expenses")
  })

  it("names Sales and Clients after what you can read", () => {
    const s = navSlotsFor(me(["contract.read", "project.read"]))
    expect(s.bar.map((x) => x.label)).toEqual([
      "Home",
      "Contracts",
      "Projects",
      "More",
    ])
  })

  it("keeps Home and More with nothing else", () => {
    expect(routes(navSlotsFor(me([])).bar)).toEqual(["index", "more"])
    expect(routes(navSlotsFor(undefined).bar)).toEqual(["index", "more"])
  })
})

describe("activeSlot", () => {
  it("lights More for a tab that lives in More", () => {
    const { bar } = navSlotsFor(me(OWNER))
    expect(activeSlot(bar, "time")).toBe("time")
    expect(activeSlot(bar, "invoices")).toBe("more")
  })
})

describe("moneyPanes and canTrackTime", () => {
  it("shows the panes your role reads", () => {
    expect(moneyPanes(["cashbook.manage"])).toEqual(["cashbook"])
    expect(moneyPanes(undefined)).toEqual([])
  })
  it("needs both the plan and the role", () => {
    expect(canTrackTime(me(["time.manage"]))).toBe(true)
    expect(canTrackTime(me(["time.track"], false))).toBe(false)
    expect(canTrackTime(me(["time.read"]))).toBe(false)
  })
})

describe("miniPlayerPlacement", () => {
  it.each([
    ["/", "tabs"],
    ["/time?week=2026-11-23", "tabs"],
    ["/more", "tabs"],
    ["/book/abc", "screen"],
    ["/invoice/abc", "screen"],
    ["/timer", "hidden"],
    ["/cashbook-entry-edit", "hidden"],
    ["/cashbook-entry", "hidden"],
    ["/workspaces", "hidden"],
  ])("%s → %s while running", (path, where) =>
    expect(miniPlayerPlacement(path, true)).toBe(where)
  )

  it("is hidden while nothing runs", () => {
    expect(miniPlayerPlacement("/", false)).toBe("hidden")
  })
})
