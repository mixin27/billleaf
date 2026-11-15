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

/**
 * Evidence of a client's response in the portal: who (typed name + the
 * session's email), when, from where, and a hash of exactly what they saw.
 */
export const portalResponses = pgTable(
  "portal_responses",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    documentType: text({ enum: ["quote", "contract"] }).notNull(),
    /** No FK: quotes or contracts. Kept even if the document is deleted. */
    documentId: uuid().notNull(),
    documentNumber: text(),
    action: text({ enum: ["accepted", "declined", "signed"] }).notNull(),
    name: text(),
    email: text().notNull(),
    reason: text(),
    /** SHA-256 of the document content the client responded to. */
    documentHash: text().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.documentType, t.documentId)]
)
