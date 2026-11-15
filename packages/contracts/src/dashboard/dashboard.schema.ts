import { z } from "zod"

import { invoiceDisplayStatusSchema } from "../invoices/invoices.schema.js"
import { paymentMethodSchema } from "../payments/payments.schema.js"

/**
 * Workspace dashboard. Amounts are minor units and always grouped by
 * currency (a workspace can bill in several). Each section is null when the
 * member lacks the permission to read it. Dates use the workspace timezone.
 */
const byCurrency = <T extends z.ZodRawShape>(shape: T) =>
  z.array(z.object({ currency: z.string(), ...shape }))

export const AGING_BUCKETS = [
  "current",
  "1_30",
  "31_60",
  "61_90",
  "90_plus",
] as const
export const agingBucketSchema = z.enum(AGING_BUCKETS)
export type AgingBucket = z.infer<typeof agingBucketSchema>

export const dashboardSchema = z.object({
  today: z.iso.date(),
  /** Workspace default currency, listed first in every currency group. */
  primaryCurrency: z.string(),
  receivables: z
    .object({
      totals: byCurrency({
        outstanding: z.number().int(),
        overdue: z.number().int(),
        openCount: z.number().int(),
        overdueCount: z.number().int(),
      }),
      aging: byCurrency({
        buckets: z.array(
          z.object({ bucket: agingBucketSchema, amount: z.number().int() })
        ),
      }),
      draftCount: z.number().int(),
      overdueInvoices: z.array(
        z.object({
          id: z.string(),
          number: z.string().nullable(),
          clientName: z.string(),
          currency: z.string(),
          amountDue: z.number().int(),
          dueDate: z.iso.date(),
          daysOverdue: z.number().int(),
          displayStatus: invoiceDisplayStatusSchema,
        })
      ),
    })
    .nullable(),
  received: z
    .object({
      thisMonth: byCurrency({
        amount: z.number().int(),
        count: z.number().int(),
      }),
      lastMonth: byCurrency({
        amount: z.number().int(),
        count: z.number().int(),
      }),
      /** Oldest → newest, always 6 entries (zero-filled), current month last. */
      monthly: byCurrency({
        months: z.array(
          z.object({ month: z.string(), amount: z.number().int() })
        ),
      }),
      recent: z.array(
        z.object({
          id: z.string(),
          invoiceId: z.string(),
          invoiceNumber: z.string().nullable(),
          receiptNumber: z.string().nullable(),
          clientName: z.string(),
          amount: z.number().int(),
          currency: z.string(),
          paidOn: z.iso.date(),
          method: paymentMethodSchema,
        })
      ),
    })
    .nullable(),
  quotes: z
    .object({
      open: byCurrency({ amount: z.number().int(), count: z.number().int() }),
      acceptedThisMonth: byCurrency({
        amount: z.number().int(),
        count: z.number().int(),
      }),
      expiringSoonCount: z.number().int(),
    })
    .nullable(),
})
export type Dashboard = z.infer<typeof dashboardSchema>

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Not yet due",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
}
