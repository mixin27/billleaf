import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization, user } from "./auth.js"
import { clients } from "./clients.js"
import { files } from "./files.js"
import { invoices } from "./invoices.js"
import { payments } from "./payments.js"

/**
 * How a workspace gets paid (shown on invoices, in emails and in the client
 * portal): a bank account, a mobile wallet (KBZPay, WavePay, AYA Pay…), or
 * free-form instructions, with an optional QR image.
 */
export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text({ enum: ["bank", "mobile_wallet", "other"] }).notNull(),
    /** e.g. "KBZ Bank", "KBZPay". */
    label: text().notNull(),
    accountName: text(),
    accountNumber: text(),
    instructions: text(),
    qrFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    /** ISO codes this account accepts; empty = any currency. */
    currencies: text().array().notNull().default([]),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId, t.position)]
)

/**
 * A client's "I've paid" with a screenshot, submitted in the client portal.
 * The workspace confirms it (records a payment + receipt) or rejects it.
 */
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    amount: integer().notNull(),
    currency: text().notNull(),
    paidOn: date({ mode: "string" }).notNull(),
    paymentAccountId: uuid().references(() => paymentAccounts.id, {
      onDelete: "set null",
    }),
    reference: text(),
    note: text(),
    fileId: uuid().references(() => files.id, { onDelete: "set null" }),
    status: text({ enum: ["pending", "confirmed", "rejected"] })
      .notNull()
      .default("pending"),
    rejectionReason: text(),
    paymentId: uuid().references(() => payments.id, { onDelete: "set null" }),
    reviewedByUserId: uuid().references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp({ withTimezone: true }),
    /** Who submitted it (the portal session's email) and from where. */
    submittedEmail: text().notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId, t.status), index().on(t.invoiceId)]
)
