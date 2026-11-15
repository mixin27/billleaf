import { z } from "zod"

import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"
import { optionalText } from "../common/locale.js"
import {
  lineItemInputSchema,
  lineItemSchema,
  MAX_LINES,
  partySnapshotSchema,
} from "../documents/line-items.js"

/**
 * Lifecycle: draft → sent → accepted | declined.
 * Only drafts are editable or deletable. Sending assigns the number
 * (QUO-0001, per workspace) and freezes client/issuer snapshots.
 * "Expired" is derived: sent + validUntil in the past.
 */
export const quoteStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "declined",
])
export type QuoteStatus = z.infer<typeof quoteStatusSchema>

const isoDate = z.iso.date()

export const quoteSummarySchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  status: quoteStatusSchema,
  isExpired: z.boolean(),
  title: z.string().nullable(),
  clientId: z.string(),
  clientName: z.string(),
  currency: z.string(),
  issueDate: isoDate,
  validUntil: isoDate.nullable(),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type QuoteSummary = z.infer<typeof quoteSummarySchema>

export const quoteSchema = quoteSummarySchema.extend({
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  lines: z.array(lineItemSchema),
  sentAt: z.iso.datetime().nullable(),
  acceptedAt: z.iso.datetime().nullable(),
  declinedAt: z.iso.datetime().nullable(),
  /** Who accepted/declined, and whether a member recorded it or the client did in the portal. */
  respondedByName: z.string().nullable(),
  respondedVia: z.enum(["manual", "portal"]).nullable(),
  declineReason: z.string().nullable(),
  /** Frozen at send time; null while draft (use live client/workspace data). */
  clientSnapshot: partySnapshotSchema.nullable(),
  issuerSnapshot: partySnapshotSchema.nullable(),
  /** Set once an accepted quote has been converted to an invoice. */
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
})
export type Quote = z.infer<typeof quoteSchema>

const lines = z.array(lineItemInputSchema).max(MAX_LINES)

export const createQuoteSchema = z.object({
  clientId: z.uuid(),
  title: optionalText(200),
  /** Defaults to the client's currency, else the workspace default. */
  currency: currencyCodeSchema.optional(),
  issueDate: isoDate.optional(),
  validUntil: isoDate.nullish(),
  notes: optionalText(5000),
  terms: optionalText(5000),
  lines: lines.default([]),
})
export type CreateQuoteInput = z.input<typeof createQuoteSchema>

export const updateQuoteSchema = z
  .object({
    clientId: z.uuid(),
    title: optionalText(200),
    currency: currencyCodeSchema,
    issueDate: isoDate,
    validUntil: isoDate.nullable(),
    notes: optionalText(5000),
    terms: optionalText(5000),
    /** When present, replaces all lines. */
    lines,
  })
  .partial()
export type UpdateQuoteInput = z.input<typeof updateQuoteSchema>

export const listQuotesQuerySchema = pageQuerySchema.extend({
  sort: sortQuery([
    "number",
    "clientName",
    "issueDate",
    "validUntil",
    "total",
    "createdAt",
  ]),
  status: quoteStatusSchema.optional(),
  clientId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListQuotesQuery = z.input<typeof listQuotesQuerySchema>

export const quoteListSchema = paged(quoteSummarySchema)
export type QuoteList = z.infer<typeof quoteListSchema>
