import { z } from "zod"

import { optionalText } from "../common/locale.js"

/** Colour names a tag can use (rendered by the web app's tag palette). */
export const TAG_COLORS = [
  "gray",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "red",
  "orange",
  "amber",
] as const
export type TagColor = (typeof TAG_COLORS)[number]

export const tagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(TAG_COLORS).nullable(),
})
export type Tag = z.infer<typeof tagSchema>

export const tagListSchema = z.object({ items: z.array(tagSchema) })
export type TagList = z.infer<typeof tagListSchema>

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(TAG_COLORS).nullish(),
})
export type CreateTagInput = z.input<typeof createTagSchema>
export const updateTagSchema = createTagSchema.partial()
export type UpdateTagInput = z.input<typeof updateTagSchema>

const tagIds = z.array(z.uuid()).max(20)
const nullableUuid = z
  .uuid()
  .nullish()
  .transform((v) => v ?? null)

/**
 * Time entries belong to a member and optionally a project (+ task) and tags.
 * Entries without a project are fine for tracking but can't be invoiced.
 * A running timer has `endedAt = null`; each member can run one at a time.
 * Entries pulled into an invoice are locked (`invoiceId` set) until that
 * draft invoice is deleted.
 */
export const timeEntrySchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
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
  /**
   * False when logged as a date + duration: there are no real clock times
   * (`startedAt` is a placeholder at 12:00 UTC of `entryDate`).
   */
  hasTimes: z.boolean(),
  billable: z.boolean(),
  tags: z.array(tagSchema),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  isRunning: z.boolean(),
  isMine: z.boolean(),
  /** In a week that's submitted or approved, so it can't change. */
  approvalLocked: z.boolean(),
  /** Dated before the workspace's locked period ends, so it can't change. */
  periodLocked: z.boolean(),
})
export type TimeEntry = z.infer<typeof timeEntrySchema>

export const startTimerSchema = z.object({
  projectId: nullableUuid,
  taskId: nullableUuid,
  description: optionalText(500),
  /** Defaults to the project's billing (billable unless non-billable). */
  billable: z.boolean().optional(),
  tagIds: tagIds.optional(),
})
export type StartTimerInput = z.input<typeof startTimerSchema>

/** Edit the running timer in place (Clockify's timer bar). */
export const updateRunningSchema = z
  .object({
    projectId: z.uuid().nullable(),
    taskId: z.uuid().nullable(),
    description: optionalText(500),
    billable: z.boolean(),
    tagIds,
    /** Move the start (e.g. "I started 20 minutes ago"). */
    startedAt: z.iso.datetime(),
  })
  .partial()
export type UpdateRunningInput = z.input<typeof updateRunningSchema>

/** Manual entry: either start+end, or a date + duration. */
export const createTimeEntrySchema = z
  .object({
    projectId: nullableUuid,
    taskId: nullableUuid,
    description: optionalText(500),
    tagIds: tagIds.optional(),
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
    projectId: z.uuid().nullable(),
    taskId: z.uuid().nullable(),
    description: optionalText(500),
    tagIds,
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

/** Set the same fields on many entries; invoiced or not-yours entries are skipped. */
export const bulkUpdateTimeEntriesSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    projectId: z.uuid().nullable().optional(),
    taskId: z.uuid().nullable().optional(),
    billable: z.boolean().optional(),
    tagIds: tagIds.optional(),
    /** "replace" (default) sets exactly `tagIds`; "add" keeps existing tags. */
    tagMode: z.enum(["replace", "add"]).optional(),
  })
  .refine((v) => v.taskId == null || v.projectId != null, {
    message: "Pick the project together with the task",
    path: ["taskId"],
  })
export type BulkUpdateTimeEntriesInput = z.input<
  typeof bulkUpdateTimeEntriesSchema
>

export const bulkDeleteTimeEntriesSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
})
export type BulkDeleteTimeEntriesInput = z.input<
  typeof bulkDeleteTimeEntriesSchema
>

export const bulkResultSchema = z.object({
  updated: z.number().int(),
  /** Invoiced, missing, or not yours to change. */
  skipped: z.number().int(),
})
export type BulkResult = z.infer<typeof bulkResultSchema>

/** Recent distinct description + project + task combos, for autocomplete. */
export const timeSuggestionSchema = z.object({
  description: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  clientName: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  billable: z.boolean(),
  tags: z.array(tagSchema),
})
export type TimeSuggestion = z.infer<typeof timeSuggestionSchema>
export const timeSuggestionListSchema = z.object({
  items: z.array(timeSuggestionSchema),
})
export const timeSuggestionsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
})
export type TimeSuggestionsQuery = z.input<typeof timeSuggestionsQuerySchema>

export const listTimeEntriesQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  projectId: z.uuid().optional(),
  tagId: z.uuid().optional(),
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
  /** Uninvoiced billable hours × current rates (minor units); null unless hourly. */
  unbilledAmount: z.number().int().nullable(),
  /** All billable time × rate (invoiced time at its invoiced rate); null unless hourly. */
  billableAmount: z.number().int().nullable(),
  /** Uninvoiced billable seconds with no rate on the task, project, member or workspace. */
  unratedSeconds: z.number().int(),
  /** Tracked time × member cost rates; null without rate.read. */
  cost: z.number().int().nullable(),
  /** Seconds whose member has no cost rate in the project currency. */
  uncostedSeconds: z.number().int(),
  /**
   * With timesheet approvals on: unbilled billable seconds in weeks not yet
   * approved (they can't be invoiced yet). 0 when approvals are off.
   */
  unapprovedSeconds: z.number().int(),
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

// ── Favourites ────────────────────────────────────────────

/** Most favourites a member can pin (shortcuts 1–9 start the first nine). */
export const MAX_TIME_FAVORITES = 12

/** A pinned entry: start it in one click (or with keys 1–9). */
export const timeFavoriteSchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  clientName: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  tags: z.array(tagSchema),
  /** Null = follow the project's billing. */
  billable: z.boolean().nullable(),
})
export type TimeFavorite = z.infer<typeof timeFavoriteSchema>
export const timeFavoriteListSchema = z.object({
  items: z.array(timeFavoriteSchema),
})

export const createTimeFavoriteSchema = z
  .object({
    description: optionalText(500),
    projectId: nullableUuid,
    taskId: nullableUuid,
    tagIds: tagIds.optional(),
    billable: z.boolean().nullish(),
  })
  .refine((v) => v.description || v.projectId, {
    message: "Give it a description or a project",
    path: ["description"],
  })
export type CreateTimeFavoriteInput = z.input<typeof createTimeFavoriteSchema>

export const reorderTimeFavoritesSchema = z.object({
  ids: z.array(z.uuid()).max(MAX_TIME_FAVORITES),
})
export type ReorderTimeFavoritesInput = z.input<
  typeof reorderTimeFavoritesSchema
>

// ── Time rules (workspace) ────────────────────────────────

/**
 * Rounding for billing and reports: each entry's duration is rounded to a
 * step (up, to the nearest, or down). Tracked time itself stays exact.
 */
export const TIME_ROUNDING_MODES = ["off", "up", "nearest", "down"] as const
export type TimeRoundingMode = (typeof TIME_ROUNDING_MODES)[number]
export const TIME_ROUNDING_STEPS = [1, 5, 6, 10, 15, 30, 60] as const
export type TimeRounding = { mode: TimeRoundingMode; minutes: number }

/** One entry's seconds after rounding (entries never round to zero going up). */
export function roundSeconds(seconds: number, rule: TimeRounding): number {
  if (rule.mode === "off" || rule.minutes <= 0 || seconds <= 0) return seconds
  const step = rule.minutes * 60
  const n = seconds / step
  const steps =
    rule.mode === "up"
      ? Math.ceil(n)
      : rule.mode === "down"
        ? Math.floor(n)
        : Math.floor(n + 0.5)
  return steps * step
}

/** "Up to 15 min", "Nearest 6 min", "Down to 30 min". */
export function roundingLabel(rule: TimeRounding): string {
  if (rule.mode === "off") return "No rounding"
  const verb =
    rule.mode === "up" ? "Up to" : rule.mode === "down" ? "Down to" : "Nearest"
  return `${verb} ${rule.minutes} min`
}
