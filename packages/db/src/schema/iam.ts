/**
 * Identity & access management tables owned by Billleaf (not Better Auth).
 *
 * Workspace == Better Auth `organization`. Every workspace-scoped table has a
 * `workspace_id` column referencing `organization.id`.
 *
 * Dynamic RBAC:
 *   permissions       — vocabulary, synced from @workspace/contracts PERMISSION_CATALOG
 *   roles             — per-workspace, cloned from SYSTEM_ROLES on workspace creation
 *   role_permissions  — which permissions a role grants
 *   member_roles      — which roles a workspace member holds (many-to-many)
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { member, organization, user } from "./auth.js"

export const permissions = pgTable("permissions", {
  key: text().primaryKey(),
  resource: text().notNull(),
  action: text().notNull(),
  description: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const roles = pgTable(
  "roles",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    /** Cloned from a SYSTEM_ROLES template. */
    isSystem: boolean().notNull().default(false),
    /** Locked roles (owner) cannot be edited or deleted. */
    isLocked: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [unique().on(t.workspaceId, t.slug), index().on(t.workspaceId)]
)

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })]
)

export const memberRoles = pgTable(
  "member_roles",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.roleId] }),
    index().on(t.workspaceId),
    index().on(t.roleId),
  ]
)

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    workspaceId: uuid().references(() => organization.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    resourceType: text(),
    resourceId: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.workspaceId, t.createdAt)]
)

/**
 * Gap-free, per-workspace document numbering (INV-0001, QUO-0042…).
 * Increment with `UPDATE … SET next_value = next_value + 1 … RETURNING`
 * inside the same transaction that inserts the document.
 */
export const documentSequences = pgTable(
  "document_sequences",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    scope: text().notNull(),
    prefix: text().notNull(),
    padding: integer().notNull().default(4),
    nextValue: integer().notNull().default(1),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.scope] })]
)
