import { describe, expect, it } from "vitest"

import {
  API_KEY_PRESETS,
  API_KEY_SCOPES,
  isApiKeyScope,
} from "./api-keys.schema.js"

describe("API key scopes", () => {
  it("allow business resources and never admin, billing or settings", () => {
    expect(API_KEY_SCOPES).toContain("invoice.create")
    expect(API_KEY_SCOPES).toContain("client.read")
    expect(API_KEY_SCOPES).toContain("workspace.read")
    for (const k of [
      "workspace.update",
      "workspace.delete",
      "workspace.export",
      "member.invite",
      "role.update",
      "billing.manage",
      "webhook.manage",
      "api_key.manage",
      "rate.read",
      "audit.read",
    ])
      expect(isApiKeyScope(k), k).toBe(false)
  })

  it("has a read-only preset of reads", () => {
    expect(API_KEY_PRESETS.read.scopes.every((k) => k.endsWith(".read"))).toBe(
      true
    )
    expect(API_KEY_PRESETS.read.scopes).toContain("invoice.read")
  })
})
