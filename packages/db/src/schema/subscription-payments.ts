import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { id, timestamps } from "./_shared.js"
import { organization, user } from "./auth.js"

/**
 * Manual SaaS billing (ADR-0013): workspaces pay Billleaf by bank transfer
 * or mobile wallet, upload proof, and a platform admin approves it. These
 * tables are platform-level (no workspace scoping) except
 * `subscription_payments`, which belongs to the paying workspace.
 */

/** What Billleaf charges for a paid plan, per interval and currency. */
export const platformPrices = pgTable(
  "platform_prices",
  {
    id: id(),
    planKey: text({ enum: ["pro", "team"] }).notNull(),
    interval: text({ enum: ["month", "year"] }).notNull(),
    currency: text().notNull(),
    /** Minor units. */
    amount: integer().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [unique().on(t.planKey, t.interval, t.currency)]
)

/** Billleaf's own bank accounts / wallets, shown on the pay page. */
export const platformPaymentAccounts = pgTable("platform_payment_accounts", {
  id: id(),
  kind: text({ enum: ["bank", "mobile_wallet", "other"] }).notNull(),
  label: text().notNull(),
  accountName: text(),
  accountNumber: text(),
  instructions: text(),
  /** Object storage key of the QR image (`_platform/…`), not in `files`. */
  qrKey: text(),
  currencies: text().array().notNull().default([]),
  position: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  ...timestamps,
})

/** A workspace's payment for a plan period, waiting for / after review. */
export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planKey: text({ enum: ["pro", "team"] }).notNull(),
    interval: text({ enum: ["month", "year"] }).notNull(),
    currency: text().notNull(),
    /** Price at request time, minor units (× periods). */
    amount: integer().notNull(),
    periods: integer().notNull().default(1),
    paidOn: date({ mode: "string" }).notNull(),
    platformPaymentAccountId: uuid().references(
      () => platformPaymentAccounts.id,
      { onDelete: "set null" }
    ),
    reference: text(),
    note: text(),
    /** Object storage key of the proof image (`_platform/…`). */
    fileKey: text().notNull(),
    status: text({ enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    rejectionReason: text(),
    reviewedByUserId: uuid().references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp({ withTimezone: true }),
    /** The period the approval granted. */
    periodStart: timestamp({ withTimezone: true }),
    periodEnd: timestamp({ withTimezone: true }),
    submittedByUserId: uuid().references(() => user.id, {
      onDelete: "set null",
    }),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.status, t.createdAt),
    index().on(t.workspaceId, t.createdAt),
    // One request waiting for review per workspace.
    uniqueIndex("subscription_payments_one_pending")
      .on(t.workspaceId)
      .where(sql`status = 'pending'`),
  ]
)
