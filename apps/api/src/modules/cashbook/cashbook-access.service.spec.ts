import { describe, expect, it } from "vitest"

import { CashbookAccess } from "./cashbook-access.service.js"

const ctx = { memberId: "me", workspaceId: "ws", permissions: new Set() }
const access = new CashbookAccess({} as never, ctx as never)
const now = new Date("2026-11-26T12:00:00Z")
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

describe("CashbookAccess.canEditEntry", () => {
  it("lets admins and owners edit any entry", () => {
    const entry = { createdByMemberId: "someone", createdAt: hoursAgo(500) }
    expect(access.canEditEntry("admin", entry, now)).toBe(true)
    expect(access.canEditEntry("owner", entry, now)).toBe(true)
  })

  it("lets operators edit their own entries for 24 hours", () => {
    expect(
      access.canEditEntry(
        "operator",
        { createdByMemberId: "me", createdAt: hoursAgo(23) },
        now
      )
    ).toBe(true)
    expect(
      access.canEditEntry(
        "operator",
        { createdByMemberId: "me", createdAt: hoursAgo(25) },
        now
      )
    ).toBe(false)
    expect(
      access.canEditEntry(
        "operator",
        { createdByMemberId: "other", createdAt: hoursAgo(1) },
        now
      )
    ).toBe(false)
  })

  it("never lets viewers edit", () => {
    expect(
      access.canEditEntry(
        "viewer",
        { createdByMemberId: "me", createdAt: hoursAgo(0) },
        now
      )
    ).toBe(false)
  })
})
