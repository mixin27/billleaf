/**
 * SaaS subscription state for a workspace (Billleaf charging its customers).
 * Plans and their limits (entitlements) are defined in code; this table only
 * stores which plan a workspace is on and the provider's references.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { timestamps } from "./_shared.js"
import { organization } from "./auth.js"

export const workspaceSubscriptions = pgTable("workspace_subscriptions", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  planKey: text().notNull().default("free"),
  status: text().notNull().default("active"),
  provider: text(),
  providerCustomerId: text(),
  providerSubscriptionId: text(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  ...timestamps,
})
