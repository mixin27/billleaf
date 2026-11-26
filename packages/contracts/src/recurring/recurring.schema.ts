import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"
import {
  discountSchema,
  lineItemInputSchema,
  MAX_LINES,
} from "../documents/line-items.js"

/**
 * Recurring invoice schedules. Each run creates one invoice for its period
 * (idempotent per schedule + period), either as a draft or issued & emailed.
 */
export const recurrenceUnitSchema = z.enum(["week", "month", "year"])
export type RecurrenceUnit = z.infer<typeof recurrenceUnitSchema>
export const recurringModeSchema = z.enum(["draft", "send"])
export type RecurringMode = z.infer<typeof recurringModeSchema>
export const recurringStatusSchema = z.enum(["active", "paused", "ended"])
export type RecurringStatus = z.infer<typeof recurringStatusSchema>

const isoDate = z.iso.date()
const storedLine = lineItemInputSchema.extend({
  taxRateBps: z.number().int().min(0).max(10_000),
})

export const recurringInvoiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  title: z.string().nullable(),
  currency: z.string(),
  lines: z.array(storedLine),
  /** Applied to every generated invoice. */
  discount: discountSchema.nullable(),
  /** Total per generated invoice (minor units), from the shared line math. */
  total: z.number().int(),
  every: z.number().int(),
  unit: recurrenceUnitSchema,
  startDate: isoDate,
  endDate: isoDate.nullable(),
  maxOccurrences: z.number().int().nullable(),
  nextRunDate: isoDate.nullable(),
  /** Days after issue; null = client/workspace payment terms. */
  dueDays: z.number().int().nullable(),
  mode: recurringModeSchema,
  status: recurringStatusSchema,
  notes: z.string().nullable(),
  terms: z.string().nullable(),
  generatedCount: z.number().int(),
  lastRunAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type RecurringInvoice = z.infer<typeof recurringInvoiceSchema>

const scheduleFields = {
  clientId: z.uuid(),
  title: optionalText(200),
  currency: currencyCodeSchema.optional(),
  lines: z
    .array(lineItemInputSchema)
    .min(1, "Add at least one line")
    .max(MAX_LINES),
  every: z.number().int().min(1).max(12).default(1),
  unit: recurrenceUnitSchema.default("month"),
  startDate: isoDate,
  endDate: isoDate.nullish().transform((v) => v ?? null),
  maxOccurrences: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .nullish()
    .transform((v) => v ?? null),
  dueDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullish()
    .transform((v) => v ?? null),
  discount: discountSchema.nullish().transform((v) => v ?? null),
  mode: recurringModeSchema.default("draft"),
  notes: optionalText(5000),
  terms: optionalText(5000),
}

export const createRecurringInvoiceSchema = z
  .object(scheduleFields)
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
export type CreateRecurringInvoiceInput = z.input<
  typeof createRecurringInvoiceSchema
>

export const updateRecurringInvoiceSchema = z
  .object({
    title: scheduleFields.title,
    currency: currencyCodeSchema,
    lines: scheduleFields.lines,
    discount: discountSchema.nullable(),
    every: z.number().int().min(1).max(12),
    unit: recurrenceUnitSchema,
    endDate: z.iso.date().nullable(),
    maxOccurrences: z.number().int().min(1).max(1000).nullable(),
    dueDays: z.number().int().min(0).max(365).nullable(),
    mode: recurringModeSchema,
    notes: scheduleFields.notes,
    terms: scheduleFields.terms,
    /** Pause/resume. ("ended" is set by the system.) */
    status: z.enum(["active", "paused"]),
  })
  .partial()
export type UpdateRecurringInvoiceInput = z.input<
  typeof updateRecurringInvoiceSchema
>

export const listRecurringQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["clientName", "nextRunDate", "createdAt"]),
  status: recurringStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListRecurringQuery = z.input<typeof listRecurringQuerySchema>
export const recurringListSchema = paged(recurringInvoiceSchema)
export type RecurringList = z.infer<typeof recurringListSchema>

export const recurringRunResultSchema = z.object({
  schedule: recurringInvoiceSchema,
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  sent: z.boolean(),
})
export type RecurringRunResult = z.infer<typeof recurringRunResultSchema>

/** Add `every` units to an ISO date, keeping the anchor day (clamped to month end). */
export function nextOccurrence(
  isoDate: string,
  every: number,
  unit: RecurrenceUnit,
  anchorDay: number
): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number]
  if (unit === "week") {
    const dt = new Date(Date.UTC(y, m - 1, d + 7 * every))
    return dt.toISOString().slice(0, 10)
  }
  const months = unit === "month" ? every : every * 12
  const total = y * 12 + (m - 1) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(anchorDay, lastDay)).padStart(2, "0")}`
}

export function describeRecurrence(
  every: number,
  unit: RecurrenceUnit
): string {
  if (every === 1)
    return unit === "week" ? "Weekly" : unit === "month" ? "Monthly" : "Yearly"
  if (unit === "month" && every === 3) return "Quarterly"
  return `Every ${every} ${unit}s`
}
