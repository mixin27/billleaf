import { describe, expect, it } from "vitest"

import type { Env } from "../../core/config/env.js"
import { TestBillingProvider } from "./test-billing.provider.js"

const env = (over: Partial<Env> = {}) =>
  ({
    NODE_ENV: "development",
    WEB_URL: "http://localhost:3000",
    BILLING_WEBHOOK_SECRET: "a-test-secret-of-sufficient-length",
    ...over,
  }) as Env

const data = {
  workspace_id: "w1",
  customer_id: "c1",
  subscription_id: "s1",
  plan: "pro" as const,
  interval: "year" as const,
  status: "active" as const,
  current_period_end: "2027-01-01T00:00:00.000Z",
  cancel_at_period_end: false,
}

describe("TestBillingProvider", () => {
  it("is unavailable in production", () => {
    expect(new TestBillingProvider(env()).available).toBe(true)
    expect(
      new TestBillingProvider(env({ NODE_ENV: "production" })).available
    ).toBe(false)
  })

  it("round-trips signed webhooks and rejects other secrets", () => {
    const p = new TestBillingProvider(env())
    const d = p.delivery({ type: "subscription.activated", data })
    const e = p.parseWebhook(d.rawBody, d.headers)
    expect(e).toMatchObject({
      type: "subscription.activated",
      workspaceId: "w1",
      planKey: "pro",
      interval: "year",
      currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
    })
    const other = new TestBillingProvider(
      env({ BILLING_WEBHOOK_SECRET: "another-secret-of-sufficient-len" })
    )
    expect(() => other.parseWebhook(d.rawBody, d.headers)).toThrow(/signature/)
  })

  it("issues checkout sessions pointing at the workspace's test page", async () => {
    const p = new TestBillingProvider(env())
    const { url } = await p.createCheckout({
      workspaceId: "w1",
      workspaceSlug: "acme",
      workspaceName: "Acme",
      customerEmail: "a@b.test",
      planKey: "team",
      interval: "month",
    })
    expect(url).toMatch(
      /^http:\/\/localhost:3000\/acme\/settings\/billing\/test\?session=/
    )
    const token = new URL(url).searchParams.get("session")!
    expect(p.readSession(token)).toMatchObject({
      kind: "checkout",
      workspaceId: "w1",
      planKey: "team",
    })
    expect(() => p.readSession(`${token}x`)).toThrow()
  })
})
