import { z } from "zod"

import { pageQuerySchema, paged, sortQuery } from "../common/pagination.js"
import { timesheetApprovalSchema } from "./approvals.schema.js"
import { timeEntrySchema } from "./time.schema.js"

// ── Timesheet grid ────────────────────────────────────────

/** A week of the member's own time as (project, task) rows × 7 days. */
export const timesheetQuerySchema = z.object({
  /** Any date in the week; the grid starts on that week's Monday. */
  week: z.iso.date(),
  /** Someone else's week (needs `time.read` or `time.approve`); default you. */
  memberId: z.uuid().optional(),
})
export type TimesheetQuery = z.input<typeof timesheetQuerySchema>

export const timesheetRowSchema = z.object({
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  clientName: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  /** Seconds per day, Monday first. */
  seconds: z.array(z.number().int()).length(7),
  /** Seconds per day that are invoiced (can't be reduced below this). */
  lockedSeconds: z.array(z.number().int()).length(7),
})
export type TimesheetRow = z.infer<typeof timesheetRowSchema>

export const timesheetSchema = z.object({
  weekStart: z.iso.date(),
  days: z.array(z.iso.date()).length(7),
  rows: z.array(timesheetRowSchema),
  /** Whether the workspace uses approvals (setting on and Team plan). */
  approvalsEnabled: z.boolean(),
  /** This week's approval, if it was submitted. */
  approval: timesheetApprovalSchema.nullable(),
  /** Submitted or approved: entries in this week can't change. */
  locked: z.boolean(),
})
export type Timesheet = z.infer<typeof timesheetSchema>

/**
 * Set one cell's total. More time adds an entry for the difference; less
 * trims or removes that cell's uninvoiced entries (newest first).
 */
export const setTimesheetCellSchema = z.object({
  date: z.iso.date(),
  projectId: z.uuid().nullable(),
  taskId: z.uuid().nullable(),
  seconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
})
export type SetTimesheetCellInput = z.input<typeof setTimesheetCellSchema>

// ── Reports ───────────────────────────────────────────────

export const REPORT_GROUPS = [
  "project",
  "client",
  "member",
  "tag",
  "task",
  "date",
] as const
export type ReportGroup = (typeof REPORT_GROUPS)[number]

/** Repeated query params arrive as a string or an array. */
const idList = z
  .union([z.uuid(), z.array(z.uuid()).max(100)])
  .optional()
  .transform((v) => (v === undefined ? undefined : [v].flat()))

export const reportFiltersSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** Without time.read only your own time is reported. */
  memberId: idList,
  projectId: idList,
  clientId: idList,
  tagId: idList,
  /** Only entries without a project. */
  withoutProject: z.enum(["true"]).optional(),
  billable: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(200).optional(),
})
export type ReportFilters = z.input<typeof reportFiltersSchema>

export const summaryReportQuerySchema = reportFiltersSchema.extend({
  groupBy: z.enum(REPORT_GROUPS).default("project"),
})
export type SummaryReportQuery = z.input<typeof summaryReportQuerySchema>

const amountSchema = z.object({
  currency: z.string(),
  /** Minor units: billable hours × rate (or, for costs, tracked hours × cost rate). */
  amount: z.number().int(),
})

export const reportGroupSchema = z.object({
  /** Id of the project/client/member/tag/task, the date, or null for "none". */
  key: z.string().nullable(),
  label: z.string(),
  /** Secondary text, e.g. the client of a project. */
  detail: z.string().nullable(),
  seconds: z.number().int(),
  billableSeconds: z.number().int(),
  amounts: z.array(amountSchema),
  /** Cost of the time per currency; empty without rate.read. */
  costs: z.array(amountSchema),
  /** Seconds per day in the range (same order as `days`). */
  byDay: z.array(z.number().int()),
})
export type ReportGroupRow = z.infer<typeof reportGroupSchema>

export const summaryReportSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  days: z.array(z.iso.date()),
  totalSeconds: z.number().int(),
  billableSeconds: z.number().int(),
  amounts: z.array(amountSchema),
  costs: z.array(amountSchema),
  /** Seconds per day (all groups). */
  byDay: z.array(
    z.object({
      date: z.iso.date(),
      seconds: z.number().int(),
      billableSeconds: z.number().int(),
    })
  ),
  groups: z.array(reportGroupSchema),
})
export type SummaryReport = z.infer<typeof summaryReportSchema>

export const detailedReportQuerySchema = reportFiltersSchema.extend({
  ...pageQuerySchema.shape,
  sort: sortQuery(["date", "duration", "description", "project", "member"]),
})
export type DetailedReportQuery = z.input<typeof detailedReportQuerySchema>

export const detailedReportSchema = paged(timeEntrySchema).extend({
  totalSeconds: z.number().int(),
  billableSeconds: z.number().int(),
})
export type DetailedReport = z.infer<typeof detailedReportSchema>

// ── Clockify import ───────────────────────────────────────

export const CLOCKIFY_DATE_FORMATS = ["auto", "MDY", "DMY", "YMD"] as const

export const clockifyImportOptionsSchema = z.object({
  /** "true" = preview only; nothing is written. */
  dryRun: z.enum(["true", "false"]).optional(),
  /** How to read dates like 03/04/2026; "auto" guesses from the file. */
  dateFormat: z.enum(CLOCKIFY_DATE_FORMATS).default("auto"),
})
export type ClockifyImportOptions = z.input<typeof clockifyImportOptionsSchema>

export const clockifyImportResultSchema = z.object({
  dryRun: z.boolean(),
  /** Batch id once committed. */
  batchId: z.string().nullable(),
  rows: z.number().int(),
  /** Entries that will be (or were) imported. */
  imported: z.number().int(),
  /** Rows already imported before (same fingerprint). */
  duplicates: z.number().int(),
  invalid: z.array(z.object({ line: z.number().int(), message: z.string() })),
  totalSeconds: z.number().int(),
  dateFormat: z.enum(["MDY", "DMY", "YMD"]),
  /** Records that don't exist yet and will be created. */
  newClients: z.array(z.string()),
  newProjects: z.array(
    z.object({ name: z.string(), clientName: z.string().nullable() })
  ),
  newTasks: z.number().int(),
  newTags: z.array(z.string()),
  /** People matched to members by email, and those mapped to you instead. */
  members: z.array(
    z.object({
      name: z.string(),
      email: z.string().nullable(),
      matched: z.boolean(),
      entries: z.number().int(),
    })
  ),
})
export type ClockifyImportResult = z.infer<typeof clockifyImportResultSchema>
