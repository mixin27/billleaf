/**
 * Workspace business profile (1:1 with `organization`). Name/slug/logo stay on
 * Better Auth's `organization`; everything that appears on documents lives here.
 */
import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { timestamps } from "./_shared.js"
import { organization } from "./auth.js"

export const workspaceProfiles = pgTable("workspace_profiles", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  legalName: text(),
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
  defaultCurrency: text().notNull().default("USD"),
  timezone: text().notNull().default("UTC"),
  locale: text().notNull().default("en-US"),
  paymentTermsDays: integer().notNull().default(14),
  /** Basis points: 700 = 7.00% */
  defaultTaxRateBps: integer().notNull().default(0),
  documentFooter: text(),
  brandColor: text(),
  ...timestamps,
})
