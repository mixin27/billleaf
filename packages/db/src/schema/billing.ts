/**
 * SaaS subscription state for a workspace (Billleaf charging its customers).
 * Plans and their limits (entitlements) are defined in code; this table only
 * stores which plan a workspace is on and the provider's references.
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization } from "./auth.js"

export const workspaceSubscriptions = pgTable("workspace_subscriptions", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  planKey: text().notNull().default("free"),
  /** active | trialing | past_due | canceled */
  status: text().notNull().default("active"),
  /** month | year (null on Free) */
  interval: text(),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  provider: text(),
  providerCustomerId: text(),
  providerSubscriptionId: text(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  /** Provider time of the last applied event; older events are ignored. */
  lastEventAt: timestamp({ withTimezone: true }),
  ...timestamps,
})

/**
 * Every verified provider webhook, stored before it is applied. The
 * (provider, event_id) key makes redelivery idempotent; failed events are
 * retried by the worker.
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: id(),
    provider: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    workspaceId: uuid().references(() => organization.id, {
      onDelete: "set null",
    }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.provider, t.eventId),
    index().on(t.workspaceId, t.occurredAt),
  ]
)
