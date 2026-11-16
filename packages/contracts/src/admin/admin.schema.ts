import { z } from "zod"

import {
  billingIntervalSchema,
  planKeySchema,
  subscriptionStatusSchema,
} from "../billing/plans.js"
import { pageQuerySchema, paged, sortQuery } from "../common/pagination.js"

/**
 * Platform admin portal (`/v1/admin`): Billleaf staff only (user.role =
 * "admin", from PLATFORM_ADMIN_EMAILS, with 2FA). Never workspace RBAC.
 */

const reason = z
  .string()
  .trim()
  .min(3, "Give a short reason (it's kept in the audit log)")
  .max(500)

export const adminOverviewSchema = z.object({
  users: z.object({
    total: z.number().int(),
    verified: z.number().int(),
    last7Days: z.number().int(),
  }),
  workspaces: z.object({
    total: z.number().int(),
    active30Days: z.number().int(),
  }),
  /** Effective plan per workspace. */
  plans: z.array(z.object({ planKey: planKeySchema, count: z.number().int() })),
  /** New users per week, oldest first (12 weeks). */
  signupsByWeek: z.array(
    z.object({ week: z.iso.date(), count: z.number().int() })
  ),
  failedJobs: z.array(z.object({ queue: z.string(), count: z.number().int() })),
  /** Manual subscription payments waiting for review. */
  pendingPayments: z.number().int(),
})
export type AdminOverview = z.infer<typeof adminOverviewSchema>

const subscriptionSchema = z.object({
  planKey: planKeySchema,
  effectivePlanKey: planKeySchema,
  status: subscriptionStatusSchema,
  interval: billingIntervalSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  provider: z.string().nullable(),
})

export const adminWorkspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  owner: z.object({ name: z.string(), email: z.string() }).nullable(),
  members: z.number().int(),
  effectivePlanKey: planKeySchema,
  currentPeriodEnd: z.iso.datetime().nullable(),
})
export type AdminWorkspaceSummary = z.infer<typeof adminWorkspaceSummarySchema>

export const adminWorkspaceListQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["createdAt", "name"]),
  q: z.string().trim().max(100).optional(),
  plan: planKeySchema.optional(),
})
export type AdminWorkspaceListQuery = z.input<
  typeof adminWorkspaceListQuerySchema
>
export const adminWorkspaceListSchema = paged(adminWorkspaceSummarySchema)

export const adminWorkspaceSchema = adminWorkspaceSummarySchema.extend({
  profile: z.object({
    email: z.string().nullable(),
    country: z.string().nullable(),
    defaultCurrency: z.string(),
    timezone: z.string(),
  }),
  memberList: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
      joinedAt: z.iso.datetime(),
    })
  ),
  usage: z.object({
    activeClients: z.number().int(),
    invoicesThisMonth: z.number().int(),
    storageMb: z.number(),
  }),
  subscription: subscriptionSchema,
  billingEvents: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      type: z.string(),
      occurredAt: z.iso.datetime(),
      processedAt: z.iso.datetime().nullable(),
      error: z.string().nullable(),
    })
  ),
  /** Manual subscription payments, newest first (last 20). */
  subscriptionPayments: z.array(
    z.object({
      id: z.string(),
      planKey: planKeySchema,
      interval: billingIntervalSchema,
      periods: z.number().int(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.enum(["pending", "approved", "rejected"]),
      paidOn: z.iso.date(),
      reference: z.string().nullable(),
      createdAt: z.iso.datetime(),
      periodEnd: z.iso.datetime().nullable(),
    })
  ),
})
export type AdminWorkspace = z.infer<typeof adminWorkspaceSchema>

/** Set a workspace's plan by hand (comp, fix, or a manual payment). */
export const adminSetPlanSchema = z.object({
  planKey: planKeySchema,
  interval: billingIntervalSchema.default("month"),
  /** When the plan ends (then Free); empty = no end date. */
  periodEnd: z.iso.date().nullish(),
  reason,
})
export type AdminSetPlanInput = z.input<typeof adminSetPlanSchema>

export const adminUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  isPlatformAdmin: z.boolean(),
  banned: z.boolean(),
  banReason: z.string().nullable(),
  banExpires: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().nullable(),
  workspaces: z.number().int(),
})
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>

export const adminUserListQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["createdAt", "name", "email"]),
  q: z.string().trim().max(100).optional(),
  banned: z.enum(["true"]).optional(),
})
export type AdminUserListQuery = z.input<typeof adminUserListQuerySchema>
export const adminUserListSchema = paged(adminUserSummarySchema)

export const adminUserSchema = adminUserSummarySchema.extend({
  memberships: z.array(
    z.object({
      workspaceId: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.string(),
    })
  ),
  sessions: z.array(
    z.object({
      id: z.string(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      ipAddress: z.string().nullable(),
      userAgent: z.string().nullable(),
      impersonatedBy: z.string().nullable(),
    })
  ),
})
export type AdminUser = z.infer<typeof adminUserSchema>

export const adminBanSchema = z.object({
  reason,
  /** Unban automatically at this time (empty = until unbanned). */
  expiresAt: z.iso.datetime().nullish(),
})
export type AdminBanInput = z.input<typeof adminBanSchema>

export const adminReasonSchema = z.object({ reason })
export type AdminReasonInput = z.input<typeof adminReasonSchema>

export const ADMIN_QUEUES = [
  "email",
  "recurring",
  "billing",
  "exports",
  "webhooks",
] as const
export const ADMIN_JOB_STATES = [
  "failed",
  "delayed",
  "waiting",
  "active",
  "completed",
] as const

export const adminJobsQuerySchema = z.object({
  queue: z.enum(ADMIN_QUEUES).optional(),
  state: z.enum(ADMIN_JOB_STATES).default("failed"),
})
export type AdminJobsQuery = z.input<typeof adminJobsQuerySchema>

export const adminJobSchema = z.object({
  id: z.string(),
  queue: z.enum(ADMIN_QUEUES),
  name: z.string(),
  attemptsMade: z.number().int(),
  failedReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** Short, non-sensitive description (e.g. email recipient + subject). */
  summary: z.string(),
})
export type AdminJob = z.infer<typeof adminJobSchema>
export const adminJobListSchema = z.object({
  items: z.array(adminJobSchema),
  counts: z.array(
    z.object({
      queue: z.enum(ADMIN_QUEUES),
      failed: z.number().int(),
      waiting: z.number().int(),
      active: z.number().int(),
      delayed: z.number().int(),
    })
  ),
})

// ── Audit log (platform-wide for admins; per workspace for audit.read) ──

export const auditEntrySchema = z.object({
  id: z.string(),
  createdAt: z.iso.datetime(),
  action: z.string(),
  actor: z
    .object({ id: z.string(), name: z.string(), email: z.string() })
    .nullable(),
  workspace: z
    .object({ id: z.string(), name: z.string(), slug: z.string() })
    .nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const auditQuerySchema = pageQuerySchema.extend({
  sort: sortQuery(["createdAt"]),
  /** Prefix match, e.g. "invoice." or "admin.". */
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(120).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})
export const adminAuditQuerySchema = auditQuerySchema.extend({
  workspaceId: z.uuid().optional(),
})
export type AuditQuery = z.input<typeof auditQuerySchema>
export type AdminAuditQuery = z.input<typeof adminAuditQuerySchema>
export const auditListSchema = paged(auditEntrySchema)
export type AuditList = z.infer<typeof auditListSchema>
