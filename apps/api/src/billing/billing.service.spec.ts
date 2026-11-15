import { NotFoundException } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import type { Env } from "../core/config/env.js"
import { BillingService } from "./billing.service.js"
import { TestBillingProvider } from "./providers/test-billing.provider.js"

const env = {
  NODE_ENV: "production",
  WEB_URL: "https://app.example.test",
  BILLING_WEBHOOK_SECRET: "dev-only-billing-webhook-secret",
} as Env

describe("BillingService.handleWebhook", () => {
  it("rejects correctly signed events when the provider is unavailable (test provider in production)", async () => {
    const provider = new TestBillingProvider(env)
    const db = { insert: vi.fn() }
    const svc = new BillingService(
      db as never,
      provider,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    )
    const d = provider.delivery({
      type: "subscription.activated",
      data: {
        workspace_id: "w1",
        customer_id: "c",
        subscription_id: "s",
        plan: "team",
        interval: "year",
        status: "active",
        current_period_end: null,
        cancel_at_period_end: false,
      },
    })
    await expect(
      svc.handleWebhook("test", d.rawBody, d.headers)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(db.insert).not.toHaveBeenCalled()
  })
})
