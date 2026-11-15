import { BadRequestException, NotFoundException } from "@nestjs/common"

import type { Env } from "../../core/config/env.js"
import type {
  BillingEvent,
  BillingProvider,
  CheckoutRequest,
  SubscriptionRef,
} from "./billing-provider.js"

/**
 * Manual payments (ADR-0013): "checkout" is Billleaf's own pay page, where
 * the workspace pays by bank transfer or mobile wallet and uploads proof.
 * A platform admin approves it, which applies a "manual" billing event
 * (`SubscriptionPaymentsService.approve`). There are no webhooks.
 */
export class ManualBillingProvider implements BillingProvider {
  readonly key = "manual"
  readonly available = true

  constructor(private readonly env: Env) {}

  private payUrl(slug: string, plan?: string, interval?: string) {
    const q = new URLSearchParams()
    if (plan) q.set("plan", plan)
    if (interval) q.set("interval", interval)
    const qs = q.toString()
    return `${this.env.WEB_URL}/${slug}/settings/billing/pay${qs ? `?${qs}` : ""}`
  }

  async createCheckout(input: CheckoutRequest) {
    return {
      url: this.payUrl(input.workspaceSlug, input.planKey, input.interval),
    }
  }

  /** Renew or change plan = pay for a new period. */
  async createPortalSession(input: SubscriptionRef) {
    return { url: this.payUrl(input.workspaceSlug) }
  }

  async changePlan(): Promise<void> {
    throw new BadRequestException({
      message:
        "Pay for the new plan on the billing page; it starts once approved.",
      code: "manual_billing_pay_instead",
    })
  }

  parseWebhook(): BillingEvent {
    throw new NotFoundException("Manual billing has no webhooks")
  }
}
