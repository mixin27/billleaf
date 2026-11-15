import { describe, expect, it } from "vitest"

import {
  ALL_PERMISSION_KEYS,
  SYSTEM_ROLES,
  isPermission,
} from "./permissions.js"

describe("permission catalog", () => {
  it("has unique keys", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length)
  })

  it("only grants known permissions in system roles", () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const p of role.permissions) expect(isPermission(p)).toBe(true)
    }
  })

  it("gives the owner every permission", () => {
    expect(SYSTEM_ROLES.owner.permissions).toHaveLength(
      ALL_PERMISSION_KEYS.length
    )
  })
})
