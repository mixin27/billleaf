import { z } from "zod"

import { contractStatusSchema } from "../contracts/contracts.schema.js"
import {
  discountSchema,
  lineItemSchema,
  partySnapshotSchema,
} from "../documents/line-items.js"
import { invoiceDisplayStatusSchema } from "../invoices/invoices.schema.js"
import {
  paymentAccountKindSchema,
  paymentProofStatusSchema,
} from "../payments/payment-proofs.schema.js"
import {
  paymentMethodSchema,
  paymentStatusSchema,
} from "../payments/payments.schema.js"

/**
 * Client portal: what a workspace's client sees after signing in with an
 * emailed link. Shapes are deliberately narrower than the internal DTOs
 * (no internal notes, recipients or ids of other records).
 */

export const portalWorkspaceSchema = z.object({
  name: z.string(),
  slug: z.string(),
  /** Paid plans only (custom branding). */
  logoUrl: z.string().nullable(),
  brandColor: z.string().nullable(),
  /** Free plan: show "Made with Billleaf". */
  showBadge: z.boolean(),
  email: z.string().nullable(),
})
export type PortalWorkspace = z.infer<typeof portalWorkspaceSchema>

export const portalSignInSchema = z.object({
  email: z.email().max(320),
})
export type PortalSignInInput = z.input<typeof portalSignInSchema>

export const portalSessionCreateSchema = z.object({
  token: z.string().min(20).max(200),
})
export const portalSessionSchema = z.object({
  workspaceSlug: z.string(),
})

const amountSchema = z.object({
  currency: z.string(),
  amount: z.number().int(),
})

export const portalMeSchema = z.object({
  workspace: portalWorkspaceSchema,
  client: z.object({ id: z.string(), name: z.string() }),
  email: z.string(),
  summary: z.object({
    openInvoices: z.number().int(),
    /** Outstanding balance per currency. */
    amountDue: z.array(amountSchema),
    overdueInvoices: z.number().int(),
    quotesAwaitingReply: z.number().int(),
    contractsAwaitingSignature: z.number().int(),
  }),
})
export type PortalMe = z.infer<typeof portalMeSchema>

export const portalQuoteStatusSchema = z.enum([
  "sent",
  "accepted",
  "declined",
  "expired",
])

export const portalQuoteSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string().nullable(),
  status: portalQuoteStatusSchema,
  issueDate: z.iso.date(),
  validUntil: z.iso.date().nullable(),
  currency: z.string(),
  total: z.number().int(),
})
export type PortalQuoteSummary = z.infer<typeof portalQuoteSummarySchema>

export const portalInvoiceSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string().nullable(),
  status: invoiceDisplayStatusSchema.exclude(["draft"]),
  issueDate: z.iso.date(),
  dueDate: z.iso.date().nullable(),
  currency: z.string(),
  total: z.number().int(),
  amountPaid: z.number().int(),
  /** Issued credit notes applied to the balance. */
  amountCredited: z.number().int(),
  amountDue: z.number().int(),
})
export type PortalInvoiceSummary = z.infer<typeof portalInvoiceSummarySchema>

export const portalContractSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  title: z.string(),
  status: contractStatusSchema.exclude(["draft"]),
  effectiveDate: z.iso.date().nullable(),
  endDate: z.iso.date().nullable(),
  sentAt: z.iso.datetime().nullable(),
  signedAt: z.iso.date().nullable(),
})
export type PortalContractSummary = z.infer<typeof portalContractSummarySchema>

export const portalReceiptSchema = z.object({
  /** The payment id (receipts are addressed by payment). */
  id: z.string(),
  receiptNumber: z.string(),
  invoiceId: z.string(),
  invoiceNumber: z.string().nullable(),
  amount: z.number().int(),
  currency: z.string(),
  paidOn: z.iso.date(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
})
export type PortalReceipt = z.infer<typeof portalReceiptSchema>

export const portalQuoteListSchema = z.object({
  items: z.array(portalQuoteSummarySchema),
})
export const portalInvoiceListSchema = z.object({
  items: z.array(portalInvoiceSummarySchema),
})
export const portalContractListSchema = z.object({
  items: z.array(portalContractSummarySchema),
})
export const portalReceiptListSchema = z.object({
  items: z.array(portalReceiptSchema),
})

const documentBody = {
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  lines: z.array(lineItemSchema),
  subtotal: z.number().int(),
  discount: discountSchema.nullable(),
  discountTotal: z.number().int(),
  taxTotal: z.number().int(),
  issuer: partySnapshotSchema.nullable(),
  client: partySnapshotSchema.nullable(),
}

export const portalQuoteSchema = portalQuoteSummarySchema.extend({
  ...documentBody,
  acceptedAt: z.iso.datetime().nullable(),
  declinedAt: z.iso.datetime().nullable(),
  respondedByName: z.string().nullable(),
  declineReason: z.string().nullable(),
})
export type PortalQuote = z.infer<typeof portalQuoteSchema>

/** One way to pay this workspace (shown while an invoice has a balance). */
export const portalPaymentAccountSchema = z.object({
  id: z.string(),
  kind: paymentAccountKindSchema,
  label: z.string(),
  accountName: z.string().nullable(),
  accountNumber: z.string().nullable(),
  instructions: z.string().nullable(),
  qrUrl: z.string().nullable(),
})
export type PortalPaymentAccount = z.infer<typeof portalPaymentAccountSchema>

/** A proof of payment this client submitted for the invoice. */
export const portalPaymentProofSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  paidOn: z.iso.date(),
  reference: z.string().nullable(),
  status: paymentProofStatusSchema,
  rejectionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type PortalPaymentProof = z.infer<typeof portalPaymentProofSchema>

export const portalInvoiceSchema = portalInvoiceSummarySchema.extend({
  ...documentBody,
  receipts: z.array(portalReceiptSchema),
  /** Empty when nothing is due. */
  paymentAccounts: z.array(portalPaymentAccountSchema),
  paymentProofs: z.array(portalPaymentProofSchema),
})
export type PortalInvoice = z.infer<typeof portalInvoiceSchema>

export const portalContractSchema = portalContractSummarySchema.extend({
  /** The text as sent (merge fields resolved). */
  body: z.string(),
  signedByName: z.string().nullable(),
  signedVia: z.enum(["manual", "portal"]).nullable(),
  declinedAt: z.iso.datetime().nullable(),
  declineReason: z.string().nullable(),
  voidedAt: z.iso.datetime().nullable(),
  issuer: partySnapshotSchema.nullable(),
  client: partySnapshotSchema.nullable(),
})
export type PortalContract = z.infer<typeof portalContractSchema>

// ── Client responses ──────────────────────────────────────

const typedName = z.string().trim().min(2, "Type your full name").max(200)

export const portalAcceptQuoteSchema = z.object({ name: typedName })
export type PortalAcceptQuoteInput = z.input<typeof portalAcceptQuoteSchema>

export const portalDeclineSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
})
export type PortalDeclineInput = z.input<typeof portalDeclineSchema>

/** Typed-name e-signature; `agree` must be ticked. */
export const portalSignContractSchema = z.object({
  name: typedName,
  agree: z.literal(true, { error: "Tick the box to sign" }),
})
export type PortalSignContractInput = z.input<typeof portalSignContractSchema>

/** The wording the signer agrees to (also printed on the signature certificate). */
export const E_SIGN_CONSENT =
  "I agree that typing my name is my electronic signature, and that I have read and accept this contract."
