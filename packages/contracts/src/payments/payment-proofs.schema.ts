import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { pageQuerySchema, paged, sortQuery } from "../common/pagination.js"
import { paymentMethodSchema } from "./payments.schema.js"

// ── Payment accounts: how a workspace gets paid ──────────────

export const paymentAccountKindSchema = z.enum([
  "bank",
  "mobile_wallet",
  "other",
])
export type PaymentAccountKind = z.infer<typeof paymentAccountKindSchema>

export const PAYMENT_ACCOUNT_KIND_LABELS: Record<PaymentAccountKind, string> = {
  bank: "Bank account",
  mobile_wallet: "Mobile wallet",
  other: "Other",
}

/** The payment method a confirmed proof records, per account kind. */
export const PAYMENT_METHOD_FOR_ACCOUNT: Record<
  PaymentAccountKind,
  z.infer<typeof paymentMethodSchema>
> = {
  bank: "bank_transfer",
  mobile_wallet: "mobile_wallet",
  other: "other",
}

export const paymentAccountSchema = z.object({
  id: z.string(),
  kind: paymentAccountKindSchema,
  label: z.string(),
  accountName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  instructions: z.string().nullable(),
  /** Short-lived presigned URL of the QR image, if any. */
  qrUrl: z.string().nullable(),
  /** Empty = any currency. */
  currencies: z.array(z.string()),
  position: z.number().int(),
  active: z.boolean(),
})
export type PaymentAccount = z.infer<typeof paymentAccountSchema>

export const paymentAccountListSchema = z.object({
  items: z.array(paymentAccountSchema),
})

const accountFields = {
  kind: paymentAccountKindSchema,
  label: z.string().trim().min(1, "Required").max(80),
  accountName: optionalText(120),
  accountNumber: optionalText(80),
  instructions: optionalText(1000),
  currencies: z.array(currencyCodeSchema).max(20),
  active: z.boolean(),
}

export const createPaymentAccountSchema = z
  .object(accountFields)
  .partial({ currencies: true, active: true })
  .refine((v) => v.accountNumber || v.instructions, {
    message: "Add an account number or instructions",
    path: ["accountNumber"],
  })
export type CreatePaymentAccountInput = z.input<
  typeof createPaymentAccountSchema
>

export const updatePaymentAccountSchema = z.object(accountFields).partial()
export type UpdatePaymentAccountInput = z.input<
  typeof updatePaymentAccountSchema
>

export const reorderPaymentAccountsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
})

// ── Payment proofs: "I've paid" from the client portal ───────

export const paymentProofStatusSchema = z.enum([
  "pending",
  "confirmed",
  "rejected",
])
export type PaymentProofStatus = z.infer<typeof paymentProofStatusSchema>

/** Multipart fields that come with the screenshot. */
export const submitPaymentProofSchema = z.object({
  amount: z.coerce.number().int().positive(),
  paidOn: z.iso.date(),
  paymentAccountId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reference: optionalText(120),
  note: optionalText(1000),
})
export type SubmitPaymentProofInput = z.input<typeof submitPaymentProofSchema>

export const paymentProofSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string().nullable(),
  clientId: z.string(),
  clientName: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  paidOn: z.iso.date(),
  paymentAccountId: z.string().nullable(),
  paymentAccountLabel: z.string().nullable(),
  paymentAccountKind: paymentAccountKindSchema.nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  hasFile: z.boolean(),
  /** Short-lived presigned URL of the screenshot (members only). */
  fileUrl: z.string().nullable(),
  status: paymentProofStatusSchema,
  rejectionReason: z.string().nullable(),
  paymentId: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  submittedEmail: z.string(),
  createdAt: z.iso.datetime(),
})
export type PaymentProof = z.infer<typeof paymentProofSchema>

export const listPaymentProofsQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["createdAt", "amount", "paidOn"]),
  status: paymentProofStatusSchema.optional(),
  invoiceId: z.uuid().optional(),
})
export type ListPaymentProofsQuery = z.input<
  typeof listPaymentProofsQuerySchema
>
export const paymentProofListSchema = paged(paymentProofSchema)
export type PaymentProofList = z.infer<typeof paymentProofListSchema>

/** Confirm records a payment (and receipt); fields default to the proof's. */
export const confirmPaymentProofSchema = z.object({
  amount: z.number().int().positive().optional(),
  paidOn: z.iso.date().optional(),
  method: paymentMethodSchema.optional(),
  reference: optionalText(200),
  /** Email the receipt to the client (default true). */
  sendReceipt: z.boolean().default(true),
})
export type ConfirmPaymentProofInput = z.input<typeof confirmPaymentProofSchema>

export const rejectPaymentProofSchema = z.object({
  reason: z.string().trim().min(3, "Tell the client why").max(500),
})
export type RejectPaymentProofInput = z.input<typeof rejectPaymentProofSchema>
