import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"

/**
 * Payments are recorded against issued invoices (always in the invoice's
 * currency, never more than the amount due). Each payment automatically gets
 * a receipt with a gap-free per-workspace number (RCT-0001). A refund marks
 * the payment refunded (money returned), voids its receipt and reduces the
 * invoice's amountPaid. Voiding does the same for a payment recorded by
 * mistake, and leaves it out of income entirely.
 */
export const paymentMethodSchema = z.enum([
  "bank_transfer",
  "mobile_wallet",
  "card",
  "cash",
  "cheque",
  "online",
  "other",
])
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  mobile_wallet: "Mobile wallet",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  online: "Online payment",
  other: "Other",
}

export const paymentStatusSchema = z.enum(["completed", "refunded", "void"])
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  completed: "Received",
  refunded: "Refunded",
  void: "Void",
}

const isoDate = z.iso.date()

export const paymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string().nullable(),
  clientId: z.string(),
  clientName: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  paidOn: isoDate,
  method: paymentMethodSchema,
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  status: paymentStatusSchema,
  refundedAt: z.iso.datetime().nullable(),
  refundReason: z.string().nullable(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  receiptId: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  receiptLastSentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type Payment = z.infer<typeof paymentSchema>

export const recordPaymentSchema = z.object({
  /** Minor units, in the invoice's currency. */
  amount: z.number().int().positive(),
  /** Defaults to today in the workspace timezone. */
  paidOn: isoDate.optional(),
  method: paymentMethodSchema.default("bank_transfer"),
  reference: optionalText(200),
  notes: optionalText(2000),
})
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>

export const refundPaymentSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason").max(500),
})
export type RefundPaymentInput = z.input<typeof refundPaymentSchema>

export const voidPaymentSchema = refundPaymentSchema
export type VoidPaymentInput = z.input<typeof voidPaymentSchema>

export const listPaymentsQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["paidOn", "amount", "clientName", "createdAt"]),
  invoiceId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: paymentStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListPaymentsQuery = z.input<typeof listPaymentsQuerySchema>

export const paymentListSchema = paged(paymentSchema)
export type PaymentList = z.infer<typeof paymentListSchema>
