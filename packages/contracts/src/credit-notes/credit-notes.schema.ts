import { z } from "zod"

import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"
import {
  discountSchema,
  lineItemInputSchema,
  lineItemSchema,
  MAX_LINES,
  partySnapshotSchema,
} from "../documents/line-items.js"

/**
 * Credit notes correct an issued invoice without editing it. They're issued
 * straight away (numbered CN-0001, gap-free) and never edited; void one to
 * undo it. The credit first lowers what the client still owes on the
 * invoice (`appliedAmount`); anything beyond that was already paid and is
 * owed back to the client (`refundAmount`).
 */
export const creditNoteStatusSchema = z.enum(["issued", "void"])
export type CreditNoteStatus = z.infer<typeof creditNoteStatusSchema>

const isoDate = z.iso.date()

export const creditNoteSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  status: creditNoteStatusSchema,
  invoiceId: z.string(),
  invoiceNumber: z.string().nullable(),
  clientId: z.string(),
  clientName: z.string(),
  issueDate: isoDate,
  reason: z.string(),
  currency: z.string(),
  subtotal: z.number().int(),
  /** Document discount, taken off before tax. */
  discount: discountSchema.nullable(),
  discountTotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  appliedAmount: z.number().int(),
  refundAmount: z.number().int(),
  createdAt: z.iso.datetime(),
})
export type CreditNoteSummary = z.infer<typeof creditNoteSummarySchema>

export const creditNoteSchema = creditNoteSummarySchema.extend({
  lines: z.array(lineItemSchema),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  lastSentAt: z.iso.datetime().nullable(),
  lastSentTo: z.string().nullable(),
  clientSnapshot: partySnapshotSchema.nullable(),
  issuerSnapshot: partySnapshotSchema.nullable(),
})
export type CreditNote = z.infer<typeof creditNoteSchema>

/**
 * Credit an invoice: the whole of it (`full: true`, copies its lines) or
 * the given lines. Can't exceed what hasn't been credited yet.
 */
export const createCreditNoteSchema = z
  .object({
    reason: z.string().trim().min(3, "Say why").max(1000),
    full: z.boolean().default(false),
    lines: z.array(lineItemInputSchema).max(MAX_LINES).default([]),
    issueDate: isoDate.optional(),
  })
  .refine((v) => v.full || v.lines.length > 0, {
    message: "Add at least one line, or credit the full invoice",
    path: ["lines"],
  })
export type CreateCreditNoteInput = z.input<typeof createCreditNoteSchema>

export const voidCreditNoteSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export const sendCreditNoteSchema = z.object({
  to: z.email().optional(),
  message: z.string().trim().max(5000).nullish(),
})
export type SendCreditNoteInput = z.input<typeof sendCreditNoteSchema>

export const listCreditNotesQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["number", "issueDate", "total", "createdAt"]),
  status: creditNoteStatusSchema.optional(),
  clientId: z.uuid().optional(),
  invoiceId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListCreditNotesQuery = z.input<typeof listCreditNotesQuerySchema>

export const creditNoteListSchema = paged(creditNoteSummarySchema)
export type CreditNoteList = z.infer<typeof creditNoteListSchema>

/**
 * How a new credit splits: first against what's still owed, the rest is a
 * refund due. `creditable` is the invoice total minus credits already issued.
 */
export function splitCredit(p: {
  credit: number
  total: number
  amountPaid: number
  amountCredited: number
}): { applied: number; refund: number; creditable: number } {
  const creditable = Math.max(0, p.total - p.amountCredited)
  const owed = Math.max(0, p.total - p.amountPaid - p.amountCredited)
  const applied = Math.min(p.credit, owed)
  return { applied, refund: p.credit - applied, creditable }
}
