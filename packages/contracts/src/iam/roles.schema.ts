import { z } from "zod"

import { planKeySchema } from "../billing/plans.js"

import { ALL_PERMISSION_KEYS, type Permission } from "./permissions.js"

export const permissionKeySchema = z.enum(
  ALL_PERMISSION_KEYS as [Permission, ...Permission[]]
)

export const roleSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isLocked: z.boolean(),
  permissions: z.array(permissionKeySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Role = z.infer<typeof roleSchema>

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionKeySchema).default([]),
})
export type CreateRoleInput = z.infer<typeof createRoleSchema>

// Explicit (not createRoleSchema.partial()) so an omitted `permissions` stays
// undefined instead of defaulting to [] and wiping the role's grants.
export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionKeySchema).optional(),
})
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>

export const assignMemberRolesSchema = z.object({
  roleIds: z.array(z.string()).min(1),
})
export type AssignMemberRolesInput = z.infer<typeof assignMemberRolesSchema>

export const permissionSchema = z.object({
  key: permissionKeySchema,
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

export const meSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    image: z.string().nullable().optional(),
    /** Billleaf staff (admin portal access). */
    isPlatformAdmin: z.boolean(),
    /** Set while a platform admin is impersonating this user. */
    impersonatedBy: z.string().nullable(),
  }),
  workspace: z
    .object({ id: z.string(), name: z.string(), slug: z.string() })
    .nullable(),
  permissions: z.array(permissionKeySchema),
  /** The workspace's effective plan and what it unlocks (for UI hints). */
  plan: z.object({
    key: planKeySchema,
    features: z.object({
      customBranding: z.boolean(),
      recurringInvoices: z.boolean(),
      timeTracking: z.boolean(),
      customRoles: z.boolean(),
    }),
  }),
})
export type Me = z.infer<typeof meSchema>

/**
 * Before deleting your account: workspaces where you're the only owner. They
 * must be deleted, or get another owner, first.
 */
export const accountDeletionCheckSchema = z.object({
  soleOwnerOf: z.array(
    z.object({ id: z.string(), name: z.string(), slug: z.string() })
  ),
})
export type AccountDeletionCheck = z.infer<typeof accountDeletionCheckSchema>
