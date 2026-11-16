import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization } from "./auth.js"

/**
 * Outgoing webhooks: URLs a workspace wants notified of events, signed
 * with the endpoint's secret (HMAC-SHA256).
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text().notNull(),
    description: text(),
    /** Event types delivered to this endpoint (see WEBHOOK_EVENTS). */
    events: text().array().notNull(),
    /** Signing secret (`whsec_…`); needed in clear text to sign. */
    secret: text().notNull(),
    enabled: boolean().notNull().default(true),
    /** Why it was turned off automatically (null when off by hand or on). */
    disabledReason: text(),
    /** Deliveries that failed for good in a row; reset by a success. */
    consecutiveFailures: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId)]
)

/** One attempt-tracked delivery of an event to an endpoint (kept 30 days). */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    endpointId: uuid()
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    /** Same for every delivery (and resend) of one event. */
    eventId: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().notNull(),
    status: text({ enum: ["pending", "succeeded", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer().notNull().default(0),
    responseStatus: integer(),
    /** First 1 KB of the response body, or the network error. */
    responseBody: text(),
    error: text(),
    durationMs: integer(),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.endpointId, t.createdAt), index().on(t.createdAt)]
)
