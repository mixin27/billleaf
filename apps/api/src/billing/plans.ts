/**
 * SaaS plans and entitlements (limits). Code-defined so pricing changes are
 * reviewed like any other change; `workspace_subscriptions.plan_key` points here.
 * Prices live in the billing provider (Paddle / Lemon Squeezy / Stripe).
 */
export const PLANS = {
  free: {
    name: "Free",
    limits: { members: 1, clients: 5, invoicesPerMonth: 10, storageMb: 100 },
    features: {
      customBranding: false,
      recurringInvoices: false,
      timeTracking: true,
    },
  },
  pro: {
    name: "Pro",
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
    },
  },
  team: {
    name: "Team",
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
    },
  },
} as const satisfies Record<
  string,
  {
    name: string
    limits: Record<string, number | null>
    features: Record<string, boolean>
  }
>

export type PlanKey = keyof typeof PLANS
export type LimitKey = keyof (typeof PLANS)["free"]["limits"]
export type FeatureKey = keyof (typeof PLANS)["free"]["features"]
