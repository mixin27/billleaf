import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { cursorPaginationQuerySchema, paginated } from "../common/pagination.js"
import { partySnapshotSchema } from "../documents/line-items.js"

/**
 * Lifecycle: draft → sent → signed | declined; sent/signed → void.
 * Only drafts are editable or deletable. Sending assigns the number
 * (CON-0001, per workspace), resolves merge fields and freezes the text and
 * both parties' details. Signatures are recorded manually for now (e-sign later).
 */
export const contractStatusSchema = z.enum([
  "draft",
  "sent",
  "signed",
  "declined",
  "void",
])
export type ContractStatus = z.infer<typeof contractStatusSchema>

const isoDate = z.iso.date()
export const MAX_CONTRACT_BODY = 50_000

const body = z
  .string()
  .trim()
  .min(1, "Write the contract text")
  .max(MAX_CONTRACT_BODY)

// ── Templates ────────────────────────────────────────────────────────────

export const contractTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ContractTemplate = z.infer<typeof contractTemplateSchema>

export const createContractTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name the template").max(120),
  body,
})
export type CreateContractTemplateInput = z.input<
  typeof createContractTemplateSchema
>
export const updateContractTemplateSchema =
  createContractTemplateSchema.partial()
export type UpdateContractTemplateInput = z.input<
  typeof updateContractTemplateSchema
>

// ── Contracts ────────────────────────────────────────────────────────────

export const contractSummarySchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  status: contractStatusSchema,
  title: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  effectiveDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  sentAt: z.iso.datetime().nullable(),
  signedAt: isoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type ContractSummary = z.infer<typeof contractSummarySchema>

export const contractSchema = contractSummarySchema.extend({
  /** Source text with {{merge.fields}} (editable while draft). */
  body: z.string(),
  /** Text with merge fields resolved: frozen at send, live preview while draft. */
  renderedBody: z.string(),
  /** Merge fields that could not be resolved (sending is blocked until fixed). */
  unresolvedFields: z.array(z.string()),
  templateId: z.string().nullable(),
  quoteId: z.string().nullable(),
  quoteNumber: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  signedByName: z.string().nullable(),
  declinedAt: z.iso.datetime().nullable(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  clientSnapshot: partySnapshotSchema.nullable(),
  issuerSnapshot: partySnapshotSchema.nullable(),
})
export type Contract = z.infer<typeof contractSchema>

export const createContractSchema = z
  .object({
    /** Optional when `quoteId` is given (the quote's client is used). */
    clientId: z.uuid().optional(),
    title: z.string().trim().max(200).optional(),
    /** Copied into `body` when `body` is omitted. */
    templateId: z.uuid().optional(),
    body: body.optional(),
    quoteId: z.uuid().nullish(),
    projectId: z.uuid().nullish(),
    effectiveDate: isoDate.nullish(),
    endDate: isoDate.nullish(),
  })
  .refine((v) => v.clientId || v.quoteId, {
    message: "Choose a client",
    path: ["clientId"],
  })
  .refine(
    (v) => !v.endDate || !v.effectiveDate || v.endDate >= v.effectiveDate,
    { message: "End date must be after the start date", path: ["endDate"] }
  )
export type CreateContractInput = z.input<typeof createContractSchema>

export const updateContractSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body,
    quoteId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    effectiveDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
  })
  .partial()
export type UpdateContractInput = z.input<typeof updateContractSchema>

export const signContractSchema = z.object({
  signedByName: z.string().trim().min(1, "Who signed for the client?").max(200),
  /** Defaults to today (workspace timezone). */
  signedAt: isoDate.optional(),
})
export type SignContractInput = z.input<typeof signContractSchema>

export const voidContractSchema = z.object({
  reason: optionalText(500),
})

export const listContractsQuerySchema = cursorPaginationQuerySchema.extend({
  status: contractStatusSchema.optional(),
  clientId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListContractsQuery = z.input<typeof listContractsQuerySchema>

export const contractListSchema = paginated(contractSummarySchema)
export type ContractList = z.infer<typeof contractListSchema>
