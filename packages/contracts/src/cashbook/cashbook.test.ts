import { describe, expect, it } from "vitest"

import { cashbookRoleAtLeast } from "./cashbook.schema.js"

describe("cashbookRoleAtLeast", () => {
  it("orders viewer < operator < admin < owner", () => {
    expect(cashbookRoleAtLeast("owner", "admin")).toBe(true)
    expect(cashbookRoleAtLeast("admin", "admin")).toBe(true)
    expect(cashbookRoleAtLeast("operator", "admin")).toBe(false)
    expect(cashbookRoleAtLeast("viewer", "operator")).toBe(false)
    expect(cashbookRoleAtLeast(null, "viewer")).toBe(false)
  })
})
