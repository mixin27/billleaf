import { z } from "zod"

/**
 * SaaS plans (Billleaf charging its customers). Limits and features are the
 * entitlements feature code checks; prices here are for display only — the
 * billing provider is the source of truth for what is charged.
 */
export const planKeySchema = z.enum(["free", "pro", "team"])
export type PlanKey = z.infer<typeof planKeySchema>
export const paidPlanKeySchema = z.enum(["pro", "team"])
export type PaidPlanKey = z.infer<typeof paidPlanKeySchema>
export const billingIntervalSchema = z.enum(["month", "year"])
export type BillingInterval = z.infer<typeof billingIntervalSchema>

type Plan = {
  name: string
  description: string
  /** Display prices in USD minor units (null = free). */
  prices: Record<BillingInterval, number> | null
  limits: {
    members: number | null
    clients: number | null
    invoicesPerMonth: number | null
    storageMb: number | null
  }
  features: {
    customBranding: boolean
    recurringInvoices: boolean
    timeTracking: boolean
    customRoles: boolean
  }
}

export const PLANS = {
  free: {
    name: "Free",
    description: "For trying Billleaf with your first clients.",
    prices: null,
    limits: { members: 1, clients: 5, invoicesPerMonth: 10, storageMb: 100 },
    features: {
      customBranding: false,
      recurringInvoices: false,
      timeTracking: true,
      customRoles: false,
    },
  },
  pro: {
    name: "Pro",
    description: "For freelancers running their business on Billleaf.",
    prices: { month: 1_200, year: 12_000 },
    limits: {
      members: 1,
      clients: null,
      invoicesPerMonth: null,
      storageMb: 5_000,
    },
    features: {
      customBranding: true,
      recurringInvoices: true,
      timeTracking: true,
      customRoles: false,
    },
  },
  team: {
    name: "Team",
    description: "For studios and agencies working together.",
    prices: { month: 2_900, year: 29_000 },
    limits: {
      members: null,
      clients: null,
      invoicesPerMonth: null,
      storageMb: 50_000,
    },
    features: {
      customBranding: true,
      recurringInvoices: true,
      timeTracking: true,
      customRoles: true,
    },
  },
} as const satisfies Record<PlanKey, Plan>

export type LimitKey = keyof Plan["limits"]
export type FeatureKey = keyof Plan["features"]

export const LIMIT_LABELS: Record<LimitKey, string> = {
  members: "members",
  clients: "active clients",
  invoicesPerMonth: "issued invoices per month",
  storageMb: "MB of file storage",
}
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  customBranding: "Your logo and colours on documents",
  recurringInvoices: "Recurring invoices",
  timeTracking: "Time tracking",
  customRoles: "Custom roles & permissions",
}

export function isPlanKey(v: string): v is PlanKey {
  return v in PLANS
}

// ── Subscription state ───────────────────────────────────────────────────

export const subscriptionStatusSchema = z.enum([
  "active",
  "trialing",
  "past_due",
  "canceled",
])
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>

/** Days a past-due subscription keeps its plan after the period ended. */
export const PAST_DUE_GRACE_DAYS = 14

/**
 * The plan a workspace actually gets right now. Paid plans fall back to
 * Free when canceled, after a scheduled cancellation passes its period end,
 * or when payment stays failed beyond the grace period.
 */
export function effectivePlan(
  sub: {
    planKey: string
    status: string
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: Date | null
  } | null,
  now: Date = new Date()
): PlanKey {
  if (!sub || !isPlanKey(sub.planKey) || sub.planKey === "free") return "free"
  const end = sub.currentPeriodEnd?.getTime()
  switch (sub.status) {
    case "canceled":
      return "free"
    case "past_due":
      return end !== undefined &&
        now.getTime() > end + PAST_DUE_GRACE_DAYS * 86_400_000
        ? "free"
        : sub.planKey
    default:
      return sub.cancelAtPeriodEnd && end !== undefined && now.getTime() > end
        ? "free"
        : sub.planKey
  }
}

// ── API shapes ───────────────────────────────────────────────────────────

const usage = z.object({
  members: z.number().int(),
  clients: z.number().int(),
  invoicesPerMonth: z.number().int(),
  storageMb: z.number(),
})

export const billingOverviewSchema = z.object({
  /** Plan on record (what the provider bills). */
  planKey: planKeySchema,
  /** Plan whose entitlements apply now (see `effectivePlan`). */
  effectivePlanKey: planKeySchema,
  status: subscriptionStatusSchema,
  interval: billingIntervalSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  /** False when no payment provider is configured (e.g. test provider in production). */
  checkoutAvailable: z.boolean(),
  /** Whether a provider portal exists for this workspace (has a paid subscription). */
  canManage: z.boolean(),
  /** "test" when using the built-in test provider. */
  provider: z.string(),
  usage,
})
export type BillingOverview = z.infer<typeof billingOverviewSchema>

export const checkoutInputSchema = z.object({
  planKey: paidPlanKeySchema,
  interval: billingIntervalSchema,
})
export type CheckoutInput = z.infer<typeof checkoutInputSchema>

export const billingRedirectSchema = z.object({ url: z.string() })
export type BillingRedirect = z.infer<typeof billingRedirectSchema>

// Test provider (local development only)
export const testCheckoutCompleteSchema = z.object({
  session: z.string().min(1),
})
export const testPortalActionSchema = z.object({
  session: z.string().min(1),
  action: z.enum([
    "cancel",
    "resume",
    "payment_failed",
    "payment_recovered",
    "end_now",
  ]),
})
export type TestPortalAction = z.infer<typeof testPortalActionSchema>["action"]
export const testSessionSchema = z.object({
  kind: z.enum(["checkout", "portal"]),
  planKey: planKeySchema,
  interval: billingIntervalSchema.nullable(),
  workspaceName: z.string(),
})
export type TestSession = z.infer<typeof testSessionSchema>
