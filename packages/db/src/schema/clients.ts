import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { id, softDelete, timestamps } from "./_shared.js"
import { organization } from "./auth.js"

export const clients = pgTable(
  "clients",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    type: text({ enum: ["company", "individual"] })
      .notNull()
      .default("company"),
    name: text().notNull(),
    email: text(),
    phone: text(),
    website: text(),
    taxId: text(),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    state: text(),
    postalCode: text(),
    country: text(),
    currency: text(),
    paymentTermsDays: integer(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    // Listing: newest first within a workspace (UUIDv7 ids are time-ordered).
    index().on(t.workspaceId, t.id),
    index("clients_workspace_name_idx").on(
      t.workspaceId,
      sql`lower(${t.name})`
    ),
  ]
)

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text().notNull(),
    email: text(),
    phone: text(),
    title: text(),
    isPrimary: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [index().on(t.clientId), index().on(t.workspaceId)]
)
