import { z } from "zod"

import { optionalText } from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import { paged, pageQuerySchema, sortQuery } from "../common/pagination.js"

/**
 * Projects group work for a client (or internal work with no client).
 * Billing: `fixed` (a fixed price, `budgetAmount`) or `hourly` (`hourlyRate`
 * per hour, used by time tracking). Amounts are minor units.
 */
export const projectStatusSchema = z.enum([
  "active",
  "on_hold",
  "completed",
  "archived",
])
export type ProjectStatus = z.infer<typeof projectStatusSchema>
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
}

export const projectBillingSchema = z.enum(["fixed", "hourly", "non_billable"])
export type ProjectBilling = z.infer<typeof projectBillingSchema>

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"])
export type TaskStatus = z.infer<typeof taskStatusSchema>
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
}

const isoDate = z.iso.date()

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  quoteId: z.string().nullable(),
  quoteNumber: z.string().nullable(),
  billing: projectBillingSchema,
  currency: z.string(),
  budgetAmount: z.number().int().nullable(),
  hourlyRate: z.number().int().nullable(),
  /** Time estimate in minutes. */
  estimateMinutes: z.number().int().nullable(),
  /** Money estimate (minor units) for hourly projects. */
  estimateAmount: z.number().int().nullable(),
  /** All finished time tracked on the project. */
  trackedSeconds: z.number().int(),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  isOverdue: z.boolean(),
  taskCounts: z.object({
    todo: z.number().int(),
    in_progress: z.number().int(),
    done: z.number().int(),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Project = z.infer<typeof projectSchema>

const projectFields = {
  name: z.string().trim().min(1, "Required").max(200),
  description: optionalText(5000),
  clientId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  billing: projectBillingSchema,
  currency: currencyCodeSchema,
  budgetAmount: z
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
  hourlyRate: z
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
  estimateMinutes: z
    .number()
    .int()
    .min(1)
    .max(10_000_000)
    .nullish()
    .transform((v) => v ?? null),
  estimateAmount: z
    .number()
    .int()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  startDate: isoDate.nullish().transform((v) => v ?? null),
  dueDate: isoDate.nullish().transform((v) => v ?? null),
}

const checkDates = (v: {
  startDate?: string | null
  dueDate?: string | null
}) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate

export const createProjectSchema = z
  .object({
    ...projectFields,
    billing: projectBillingSchema.default("hourly"),
    /** Defaults to the client's currency, else the workspace default. */
    currency: currencyCodeSchema.optional(),
  })
  .refine(checkDates, {
    message: "Due date must be on or after the start date",
    path: ["dueDate"],
  })
export type CreateProjectInput = z.input<typeof createProjectSchema>

export const updateProjectSchema = z
  .object({ ...projectFields, status: projectStatusSchema })
  .partial()
  .refine(checkDates, {
    message: "Due date must be on or after the start date",
    path: ["dueDate"],
  })
export type UpdateProjectInput = z.input<typeof updateProjectSchema>

export const listProjectsQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["name", "clientName", "dueDate", "createdAt"]),
  status: projectStatusSchema.optional(),
  clientId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
})
export type ListProjectsQuery = z.input<typeof listProjectsQuerySchema>

export const projectListSchema = paged(projectSchema)
export type ProjectList = z.infer<typeof projectListSchema>

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: taskStatusSchema,
  position: z.number(),
  dueDate: isoDate.nullable(),
  assigneeMemberId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  /** Billable rate per hour (project currency); overrides the project's. */
  hourlyRate: z.number().int().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type Task = z.infer<typeof taskSchema>

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Required").max(300),
  notes: optionalText(5000),
  status: taskStatusSchema.default("todo"),
  dueDate: isoDate.nullish().transform((v) => v ?? null),
  assigneeMemberId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  hourlyRate: z
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
})
export type CreateTaskInput = z.input<typeof createTaskSchema>

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    notes: optionalText(5000),
    status: taskStatusSchema,
    dueDate: isoDate.nullable(),
    assigneeMemberId: z.uuid().nullable(),
    hourlyRate: z.number().int().min(0).nullable(),
    /**
     * Move the task: place it immediately after this task id in the target
     * status column (null = first). Combine with `status` to move columns.
     */
    afterTaskId: z.uuid().nullable(),
  })
  .partial()
export type UpdateTaskInput = z.input<typeof updateTaskSchema>
