import { z } from "zod"

import { optionalText } from "../common/locale.js"

/**
 * Time entries belong to a project (and optionally a task) and a member.
 * A running timer has `endedAt = null`; each member can run one at a time.
 * Entries pulled into an invoice are locked (`invoiceId` set) until that
 * draft invoice is deleted.
 */
export const timeEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  clientName: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  /** Null when the member has left the workspace (their time is kept). */
  memberId: z.string().nullable(),
  memberName: z.string(),
  description: z.string().nullable(),
  /** Workspace-local calendar date of the start. */
  entryDate: z.iso.date(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  /** Null while running. */
  durationSeconds: z.number().int().nullable(),
  billable: z.boolean(),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  isRunning: z.boolean(),
  isMine: z.boolean(),
})
export type TimeEntry = z.infer<typeof timeEntrySchema>

export const startTimerSchema = z.object({
  projectId: z.uuid(),
  taskId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  description: optionalText(500),
})
export type StartTimerInput = z.input<typeof startTimerSchema>

/** Manual entry: either start+end, or a date + duration. */
export const createTimeEntrySchema = z
  .object({
    projectId: z.uuid(),
    taskId: z
      .uuid()
      .nullish()
      .transform((v) => v ?? null),
    description: optionalText(500),
    startedAt: z.iso.datetime().optional(),
    endedAt: z.iso.datetime().optional(),
    entryDate: z.iso.date().optional(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional(),
    billable: z.boolean().optional(),
    /** time.manage only: log time for another member. */
    memberId: z.uuid().optional(),
  })
  .refine(
    (v) => (v.startedAt && v.endedAt) || (v.entryDate && v.durationMinutes),
    {
      message: "Give a start and end time, or a date and duration",
      path: ["durationMinutes"],
    }
  )
  .refine((v) => !v.startedAt || !v.endedAt || v.startedAt < v.endedAt, {
    message: "End must be after start",
    path: ["endedAt"],
  })
export type CreateTimeEntryInput = z.input<typeof createTimeEntrySchema>

export const updateTimeEntrySchema = z
  .object({
    projectId: z.uuid(),
    taskId: z.uuid().nullable(),
    description: optionalText(500),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    entryDate: z.iso.date(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60),
    billable: z.boolean(),
  })
  .partial()
export type UpdateTimeEntryInput = z.input<typeof updateTimeEntrySchema>

export const listTimeEntriesQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  projectId: z.uuid().optional(),
  /** "me" (default for members without time.read) or a member id. */
  memberId: z.union([z.literal("me"), z.uuid()]).optional(),
  billable: z.enum(["true", "false"]).optional(),
  uninvoiced: z.enum(["true"]).optional(),
})
export type ListTimeEntriesQuery = z.input<typeof listTimeEntriesQuerySchema>

export const timeEntryListSchema = z.object({
  items: z.array(timeEntrySchema),
  totalSeconds: z.number().int(),
  billableSeconds: z.number().int(),
})
export type TimeEntryList = z.infer<typeof timeEntryListSchema>

export const projectTimeSummarySchema = z.object({
  totalSeconds: z.number().int(),
  billableSeconds: z.number().int(),
  unbilledSeconds: z.number().int(),
  /** unbilled hours × hourly rate (minor units); null when not hourly or no rate. */
  unbilledAmount: z.number().int().nullable(),
  currency: z.string(),
})
export type ProjectTimeSummary = z.infer<typeof projectTimeSummarySchema>

export const invoiceFromTimeSchema = z.object({
  projectId: z.uuid(),
  /** Defaults to all billable, uninvoiced, finished entries of the project. */
  entryIds: z.array(z.uuid()).max(1000).optional(),
})
export type InvoiceFromTimeInput = z.input<typeof invoiceFromTimeSchema>

/** Seconds → billable hours with 2 decimals (0.01 h = 36 s), half-up. */
export function secondsToHours(seconds: number): number {
  return Math.round(seconds / 36) / 100
}

/** "1:05" style display for durations. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}
