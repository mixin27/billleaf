import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { pageQuerySchema, paged, sortQuery } from "../common/pagination.js"
import { paymentAccountSchema } from "../payments/payment-proofs.schema.js"
import {
  billingIntervalSchema,
  paidPlanKeySchema,
  planKeySchema,
} from "./plans.js"

/**
 * Manual SaaS billing (ADR-0013): a workspace pays Billleaf by bank transfer
 * or mobile wallet, uploads proof, and a platform admin approves it.
 */

/** Days before the period end when owners are reminded to renew. */
export const RENEWAL_REMINDER_DAYS = [7, 1] as const

// ── Prices (set by platform admins) ──────────────────────────

export const platformPriceSchema = z.object({
  id: z.string(),
  planKey: paidPlanKeySchema,
  interval: billingIntervalSchema,
  currency: z.string(),
  /** Minor units. */
  amount: z.number().int(),
  active: z.boolean(),
})
export type PlatformPrice = z.infer<typeof platformPriceSchema>
export const platformPriceListSchema = z.object({
  items: z.array(platformPriceSchema),
})

export const createPlatformPriceSchema = z.object({
  planKey: paidPlanKeySchema,
  interval: billingIntervalSchema,
  currency: currencyCodeSchema,
  amount: z.number().int().positive(),
  active: z.boolean().optional(),
})
export type CreatePlatformPriceInput = z.input<typeof createPlatformPriceSchema>

export const updatePlatformPriceSchema = z.object({
  amount: z.number().int().positive().optional(),
  active: z.boolean().optional(),
})
export type UpdatePlatformPriceInput = z.input<typeof updatePlatformPriceSchema>

// ── Subscription payments ────────────────────────────────────

export const subscriptionPaymentStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
])
export type SubscriptionPaymentStatus = z.infer<
  typeof subscriptionPaymentStatusSchema
>

export const subscriptionPaymentSchema = z.object({
  id: z.string(),
  planKey: paidPlanKeySchema,
  interval: billingIntervalSchema,
  currency: z.string(),
  amount: z.number().int(),
  periods: z.number().int(),
  paidOn: z.iso.date(),
  paymentAccountLabel: z.string().nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  status: subscriptionPaymentStatusSchema,
  rejectionReason: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  periodStart: z.iso.datetime().nullable(),
  periodEnd: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type SubscriptionPayment = z.infer<typeof subscriptionPaymentSchema>
export const subscriptionPaymentListSchema = z.object({
  items: z.array(subscriptionPaymentSchema),
})

/** Multipart fields sent with the proof image. The amount comes from the price. */
export const submitSubscriptionPaymentSchema = z.object({
  planKey: paidPlanKeySchema,
  interval: billingIntervalSchema,
  currency: currencyCodeSchema,
  periods: z.coerce.number().int().min(1).max(12).default(1),
  paidOn: z.iso.date(),
  platformPaymentAccountId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reference: optionalText(120),
  note: optionalText(1000),
})
export type SubmitSubscriptionPaymentInput = z.input<
  typeof submitSubscriptionPaymentSchema
>

/** Everything the workspace's pay page needs. */
export const manualBillingOptionsSchema = z.object({
  prices: z.array(platformPriceSchema),
  accounts: z.array(paymentAccountSchema),
  /** The request waiting for review, if any (one at a time). */
  pending: subscriptionPaymentSchema.nullable(),
})
export type ManualBillingOptions = z.infer<typeof manualBillingOptionsSchema>

// ── Admin review ─────────────────────────────────────────────

export const adminSubscriptionPaymentSchema = subscriptionPaymentSchema.extend({
  workspace: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  submittedBy: z.object({ name: z.string(), email: z.string() }).nullable(),
  /** Short-lived presigned URL of the proof image. */
  fileUrl: z.string().nullable(),
  /** The workspace's plan when the list was loaded. */
  currentPlanKey: planKeySchema,
  currentPeriodEnd: z.iso.datetime().nullable(),
})
export type AdminSubscriptionPayment = z.infer<
  typeof adminSubscriptionPaymentSchema
>

export const adminSubscriptionPaymentQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["createdAt"]),
  status: subscriptionPaymentStatusSchema.default("pending"),
})
export type AdminSubscriptionPaymentQuery = z.input<
  typeof adminSubscriptionPaymentQuerySchema
>
export const adminSubscriptionPaymentListSchema = paged(
  adminSubscriptionPaymentSchema
)

export const approveSubscriptionPaymentSchema = z.object({
  /** Override how many periods to grant (default: what was paid for). */
  periods: z.number().int().min(1).max(36).optional(),
})
export type ApproveSubscriptionPaymentInput = z.input<
  typeof approveSubscriptionPaymentSchema
>

export const rejectSubscriptionPaymentSchema = z.object({
  reason: z.string().trim().min(3, "Tell them why").max(500),
})
export type RejectSubscriptionPaymentInput = z.input<
  typeof rejectSubscriptionPaymentSchema
>

/** Public pricing page: which billing mode is live, and admin-set prices. */
export const publicPricingSchema = z.object({
  /** "manual" = the admin-set prices below apply; otherwise `PLANS` prices. */
  provider: z.string(),
  prices: z.array(platformPriceSchema),
})
export type PublicPricing = z.infer<typeof publicPricingSchema>
