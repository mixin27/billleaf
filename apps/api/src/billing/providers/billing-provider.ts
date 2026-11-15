import type {
  BillingInterval,
  PaidPlanKey,
  PlanKey,
  SubscriptionStatus,
} from "@workspace/contracts"

/** Provider-neutral subscription event, produced by a provider adapter. */
export interface BillingEvent {
  /** Provider event id (idempotency key with the provider name). */
  id: string
  type:
    "subscription.activated" | "subscription.updated" | "subscription.canceled"
  occurredAt: Date
  workspaceId: string
  customerId: string | null
  subscriptionId: string | null
  /** Paid plans from providers; "free" only from manual/admin events. */
  planKey: PlanKey
  interval: BillingInterval
  status: SubscriptionStatus
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Original payload, stored for audit/debugging. */
  raw: Record<string, unknown>
  /**
   * Who produced the event when it isn't the configured provider, e.g.
   * "manual" for a plan set by a platform admin or a manual payment.
   */
  provider?: string
}

export interface CheckoutRequest {
  workspaceId: string
  workspaceSlug: string
  workspaceName: string
  customerEmail: string
  planKey: PaidPlanKey
  interval: BillingInterval
}

export interface SubscriptionRef {
  workspaceId: string
  workspaceSlug: string
  workspaceName: string
  customerId: string | null
  subscriptionId: string | null
}

/**
 * One implementation is active (BILLING_PROVIDER). Adapters for Paddle or
 * Lemon Squeezy implement this; nothing else in the app knows the provider.
 */
export interface BillingProvider {
  readonly key: string
  /** False when this provider must not take payments here (e.g. test in prod). */
  readonly available: boolean
  /** Hosted checkout for a new subscription. */
  createCheckout(input: CheckoutRequest): Promise<{ url: string }>
  /** Hosted page to change payment method, cancel, see invoices. */
  createPortalSession(input: SubscriptionRef): Promise<{ url: string }>
  /** Switch an existing subscription's plan/interval (prorated by the provider). */
  changePlan(
    input: SubscriptionRef & { planKey: PaidPlanKey; interval: BillingInterval }
  ): Promise<void>
  /** Verify the signature and normalise the payload; throws if invalid. */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>
  ): BillingEvent
}

export const BILLING_PROVIDER = Symbol("BILLING_PROVIDER")
