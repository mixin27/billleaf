import { z } from "zod"

/**
 * Timesheet approvals (Team plan, when the workspace turns them on). A
 * member submits a week (Monday–Sunday, workspace dates); an approver
 * (`time.approve`) approves it or sends it back with a note. Submitted and
 * approved weeks are locked; only approved time can be invoiced.
 */
export const APPROVAL_STATUSES = ["submitted", "approved", "rejected"] as const
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES)
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>

export const timesheetApprovalSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  memberName: z.string(),
  weekStart: z.iso.date(),
  status: approvalStatusSchema,
  totalSeconds: z.number().int(),
  billableSeconds: z.number().int(),
  submittedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewedByName: z.string().nullable(),
  /** The reviewer's note (always set when sent back). */
  note: z.string().nullable(),
})
export type TimesheetApproval = z.infer<typeof timesheetApprovalSchema>

export const timesheetApprovalListSchema = z.object({
  items: z.array(timesheetApprovalSchema),
  /** Weeks waiting for review (for the tab badge). */
  pendingCount: z.number().int(),
  /** The plan includes approvals (Team). */
  available: z.boolean(),
  /** Approvals apply now: available and turned on in settings. */
  enabled: z.boolean(),
})
export type TimesheetApprovalList = z.infer<typeof timesheetApprovalListSchema>

export const listTimesheetApprovalsQuerySchema = z.object({
  status: approvalStatusSchema.optional(),
  memberId: z.uuid().optional(),
})
export type ListTimesheetApprovalsQuery = z.input<
  typeof listTimesheetApprovalsQuerySchema
>

/** Submit or withdraw your own week (any date in it). */
export const timesheetWeekSchema = z.object({ week: z.iso.date() })
export type TimesheetWeekInput = z.input<typeof timesheetWeekSchema>

export const reviewTimesheetSchema = z.object({
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || undefined),
})
export type ReviewTimesheetInput = z.input<typeof reviewTimesheetSchema>

export const rejectTimesheetSchema = z.object({
  note: z.string().trim().min(3, "Say what to change").max(1000),
})
export type RejectTimesheetInput = z.input<typeof rejectTimesheetSchema>
