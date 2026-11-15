import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { id } from "./_shared.js"
import { organization } from "./auth.js"
import { clients } from "./clients.js"

/**
 * Client-portal access tokens (only a SHA-256 hash is stored).
 * - `sign_in`: emailed after a client asks for a link; single use, minutes.
 * - `link`: inside a document email; reusable until it expires (days), so
 *   mail scanners opening it don't burn it.
 */
export const portalTokens = pgTable(
  "portal_tokens",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Who the link was sent to (lower-case). */
    email: text().notNull(),
    kind: text({ enum: ["sign_in", "link"] }).notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.email, t.createdAt)]
)

/** A signed-in portal visitor: one client of one workspace. */
export const portalSessions = pgTable(
  "portal_sessions",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    email: text().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.clientId)]
)
