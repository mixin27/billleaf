/**
 * Permission catalog — the single source of truth for every permission key.
 *
 * - Keys follow `<resource>.<action>`.
 * - The API syncs this catalog into the `permissions` table on boot/deploy
 *   (see `apps/api/src/iam/permissions/permission-sync.service.ts`).
 * - Roles (and which permissions they grant) are dynamic per workspace and
 *   live in the database; only the *vocabulary* lives in code.
 *
 * To add a permission: add it here, then (optionally) grant it to the
 * relevant SYSTEM_ROLES below. See `.claude/skills/add-permission`.
 */
export const PERMISSION_CATALOG = {
  workspace: {
    read: "View workspace profile and settings",
    update: "Edit workspace profile, branding and preferences",
    delete: "Delete the workspace",
  },
  member: {
    read: "View workspace members",
    invite: "Invite new members",
    update: "Change member roles",
    remove: "Remove members",
  },
  role: {
    read: "View roles and permissions",
    create: "Create custom roles",
    update: "Edit roles and their permissions",
    delete: "Delete custom roles",
  },
  billing: {
    read: "View subscription and invoices from Billleaf",
    manage: "Change plan and payment method",
  },
  audit: {
    read: "View the audit log",
  },
  client: {
    read: "View clients",
    create: "Create clients",
    update: "Edit clients",
    delete: "Delete clients",
  },
  quote: {
    read: "View quotes",
    create: "Create quotes",
    update: "Edit draft quotes",
    send: "Send quotes to clients",
    delete: "Delete draft quotes",
  },
  contract: {
    read: "View contracts",
    create: "Create contracts",
    update: "Edit contracts",
    delete: "Delete contracts",
  },
  project: {
    read: "View projects",
    create: "Create projects",
    update: "Edit projects and tasks",
    delete: "Delete projects",
  },
  time: {
    read: "View all time entries",
    track: "Track own time",
    manage: "Edit anyone's time entries",
  },
  invoice: {
    read: "View invoices",
    create: "Create invoices",
    update: "Edit draft invoices",
    send: "Issue and send invoices",
    void: "Void issued invoices",
  },
  payment: {
    read: "View payments and receipts",
    record: "Record payments and issue receipts",
    refund: "Refund payments",
  },
} as const satisfies Record<string, Record<string, string>>

type Catalog = typeof PERMISSION_CATALOG
export type PermissionResource = keyof Catalog
export type Permission = {
  [R in PermissionResource]: `${R}.${Extract<keyof Catalog[R], string>}`
}[PermissionResource]

export interface PermissionDefinition {
  key: Permission
  resource: PermissionResource
  action: string
  description: string
}

export const PERMISSIONS: readonly PermissionDefinition[] = Object.entries(
  PERMISSION_CATALOG
).flatMap(([resource, actions]) =>
  Object.entries(actions).map(([action, description]) => ({
    key: `${resource}.${action}` as Permission,
    resource: resource as PermissionResource,
    action,
    description,
  }))
)

export const ALL_PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map(
  (p) => p.key
)

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSION_KEYS as readonly string[]).includes(value)
}

const readAll = ALL_PERMISSION_KEYS.filter((k) => k.endsWith(".read"))

/**
 * Role templates cloned into every new workspace. After cloning they are
 * ordinary rows that workspace admins can edit — except `owner`, which is
 * locked and always holds every permission.
 */
export const SYSTEM_ROLES = {
  owner: {
    name: "Owner",
    description: "Full access, including billing and deleting the workspace.",
    permissions: ALL_PERMISSION_KEYS,
    locked: true,
  },
  admin: {
    name: "Admin",
    description: "Manage everything except billing and workspace deletion.",
    permissions: ALL_PERMISSION_KEYS.filter(
      (k) => k !== "workspace.delete" && k !== "billing.manage"
    ),
    locked: false,
  },
  member: {
    name: "Member",
    description: "Work on clients, projects and time; cannot manage billing.",
    permissions: [
      ...readAll.filter((k) => !["billing.read", "audit.read"].includes(k)),
      "client.create",
      "client.update",
      "project.create",
      "project.update",
      "quote.create",
      "quote.update",
      "time.track",
    ] satisfies Permission[],
    locked: false,
  },
  accountant: {
    name: "Accountant",
    description: "Read-only access plus invoicing and payments.",
    permissions: [
      ...readAll,
      "invoice.create",
      "invoice.update",
      "invoice.send",
      "invoice.void",
      "payment.record",
      "payment.refund",
    ] satisfies Permission[],
    locked: false,
  },
} as const satisfies Record<
  string,
  {
    name: string
    description: string
    permissions: readonly Permission[]
    locked: boolean
  }
>

export type SystemRoleSlug = keyof typeof SYSTEM_ROLES
