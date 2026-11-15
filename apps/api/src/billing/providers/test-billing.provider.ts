import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

import { UnauthorizedException } from "@nestjs/common"
import {
  type BillingInterval,
  type PaidPlanKey,
  paidPlanKeySchema,
  billingIntervalSchema,
  subscriptionStatusSchema,
} from "@workspace/contracts"

import type { Env } from "../../core/config/env.js"
import type {
  BillingEvent,
  BillingProvider,
  CheckoutRequest,
  SubscriptionRef,
} from "./billing-provider.js"

export const TEST_SIGNATURE_HEADER = "x-billleaf-signature"

/** Payload the test provider signs, shaped like a real provider's webhook. */
export interface TestWebhookPayload {
  id: string
  type: BillingEvent["type"]
  occurred_at: string
  data: {
    workspace_id: string
    customer_id: string
    subscription_id: string
    plan: PaidPlanKey
    interval: BillingInterval
    status: BillingEvent["status"]
    current_period_end: string | null
    cancel_at_period_end: boolean
  }
}

export interface TestSessionClaims {
  kind: "checkout" | "portal"
  workspaceId: string
  planKey: PaidPlanKey | null
  interval: BillingInterval | null
  exp: number
}

/**
 * Built-in provider for local development and CI. Checkout and portal are
 * pages in the web app (Settings → Billing → test checkout); their actions
 * produce signed webhooks that go through the normal webhook pipeline.
 * Never takes real payments and is unavailable in production.
 */
export class TestBillingProvider implements BillingProvider {
  readonly key = "test"
  readonly available: boolean

  constructor(private readonly env: Env) {
    this.available = env.NODE_ENV !== "production"
  }

  private sign(data: string) {
    return createHmac("sha256", this.env.BILLING_WEBHOOK_SECRET)
      .update(data)
      .digest("base64url")
  }

  /** Short-lived signed token naming the workspace and requested plan. */
  issueSession(claims: Omit<TestSessionClaims, "exp">) {
    const body = Buffer.from(
      JSON.stringify({ ...claims, exp: Date.now() + 30 * 60_000 })
    ).toString("base64url")
    return `${body}.${this.sign(`session.${body}`)}`
  }

  readSession(token: string): TestSessionClaims {
    const [body, sig] = token.split(".")
    if (!body || !sig || !safeEqual(sig, this.sign(`session.${body}`)))
      throw new UnauthorizedException("Invalid test billing session")
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as TestSessionClaims
    if (claims.exp < Date.now())
      throw new UnauthorizedException("Test billing session expired")
    return claims
  }

  async createCheckout(input: CheckoutRequest) {
    const session = this.issueSession({
      kind: "checkout",
      workspaceId: input.workspaceId,
      planKey: input.planKey,
      interval: input.interval,
    })
    return {
      url: `${this.env.WEB_URL}/${input.workspaceSlug}/settings/billing/test?session=${session}`,
    }
  }

  async createPortalSession(input: SubscriptionRef) {
    const session = this.issueSession({
      kind: "portal",
      workspaceId: input.workspaceId,
      planKey: null,
      interval: null,
    })
    return {
      url: `${this.env.WEB_URL}/${input.workspaceSlug}/settings/billing/test?session=${session}`,
    }
  }

  // Plan changes are delivered as webhooks by BillingService.simulate().
  async changePlan() {}

  /** Build a signed webhook delivery for `payload`. */
  delivery(
    payload: Omit<TestWebhookPayload, "id" | "occurred_at">,
    occurredAt = new Date()
  ) {
    const full: TestWebhookPayload = {
      id: `evt_${randomUUID()}`,
      occurred_at: occurredAt.toISOString(),
      ...payload,
    }
    const rawBody = Buffer.from(JSON.stringify(full))
    return {
      rawBody,
      headers: {
        [TEST_SIGNATURE_HEADER]: this.sign(rawBody.toString("utf8")),
      },
    }
  }

  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>
  ): BillingEvent {
    const header = headers[TEST_SIGNATURE_HEADER]
    const sig = Array.isArray(header) ? header[0] : header
    if (!sig || !safeEqual(sig, this.sign(rawBody.toString("utf8"))))
      throw new UnauthorizedException("Invalid webhook signature")
    const p = JSON.parse(rawBody.toString("utf8")) as TestWebhookPayload
    return {
      id: p.id,
      type: p.type,
      occurredAt: new Date(p.occurred_at),
      workspaceId: p.data.workspace_id,
      customerId: p.data.customer_id,
      subscriptionId: p.data.subscription_id,
      planKey: paidPlanKeySchema.parse(p.data.plan),
      interval: billingIntervalSchema.parse(p.data.interval),
      status: subscriptionStatusSchema.parse(p.data.status),
      currentPeriodEnd: p.data.current_period_end
        ? new Date(p.data.current_period_end)
        : null,
      cancelAtPeriodEnd: p.data.cancel_at_period_end,
      raw: p as unknown as Record<string, unknown>,
    }
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
