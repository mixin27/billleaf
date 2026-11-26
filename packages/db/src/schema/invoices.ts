import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization } from "./auth.js"
import { clients } from "./clients.js"
import { quotes } from "./quotes.js"
import { recurringInvoices } from "./recurring.js"

type PartySnapshot = {
  name: string
  legalName?: string | null
  email?: string | null
  phone?: string | null
  taxId?: string | null
  addressLines: string[]
}

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Source quote, when converted. One invoice per quote. */
    quoteId: uuid().references(() => quotes.id, { onDelete: "restrict" }),
    /** Schedule that generated this invoice, and the period it covers. */
    recurringId: uuid().references(() => recurringInvoices.id, {
      onDelete: "set null",
    }),
    recurringPeriod: date({ mode: "string" }),
    /** Assigned on issue (gap-free per workspace); null while draft. */
    number: text(),
    status: text({ enum: ["draft", "issued", "void"] })
      .notNull()
      .default("draft"),
    title: text(),
    currency: text().notNull(),
    issueDate: date({ mode: "string" }).notNull(),
    dueDate: date({ mode: "string" }),
    notes: text(),
    terms: text(),
    subtotal: integer().notNull().default(0),
    /** Document discount (taken off before tax): percent in bps, or minor units. */
    discountType: text({ enum: ["percent", "amount"] }),
    discountValue: integer(),
    discountTotal: integer().notNull().default(0),
    taxTotal: integer().notNull().default(0),
    total: integer().notNull().default(0),
    /** Maintained by the Payments module; 0 until payments are recorded. */
    amountPaid: integer().notNull().default(0),
    /** Sum of issued credit notes applied to this invoice's balance. */
    amountCredited: integer().notNull().default(0),
    clientSnapshot: jsonb().$type<PartySnapshot>(),
    issuerSnapshot: jsonb().$type<PartySnapshot>(),
    issuedAt: timestamp({ withTimezone: true }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    lastSentAt: timestamp({ withTimezone: true }),
    lastSentTo: text(),
    /** Skip automatic payment reminders for this invoice. */
    remindersPaused: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique().on(t.workspaceId, t.number),
    unique().on(t.quoteId),
    // Idempotency: one invoice per schedule period, however often the job retries.
    unique().on(t.recurringId, t.recurringPeriod),
    index().on(t.workspaceId, t.id),
    index().on(t.workspaceId, t.status, t.dueDate),
    index().on(t.clientId),
    index("invoices_workspace_number_lower_idx").on(
      t.workspaceId,
      sql`lower(${t.number})`
    ),
  ]
)

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    description: text().notNull(),
    quantity: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    unitPrice: integer().notNull(),
    taxRateBps: integer().notNull().default(0),
    amount: integer().notNull(),
    taxAmount: integer().notNull(),
  },
  (t) => [index().on(t.invoiceId, t.position)]
)

/**
 * Payment reminders emailed to the client, one row per invoice and offset
 * (days relative to the due date). The unique key makes each one go out once.
 */
export const invoiceReminders = pgTable(
  "invoice_reminders",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    offsetDays: integer().notNull(),
    sentTo: text().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.invoiceId, t.offsetDays), index().on(t.workspaceId)]
)

/**
 * Credit notes: issued against an issued invoice, immutable (void to undo).
 * `applied_amount` reduced the invoice's balance; `refund_amount` is the
 * part beyond what was still owed (the client already paid it), to be
 * refunded or kept as credit outside Billleaf.
 */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    number: text().notNull(),
    status: text({ enum: ["issued", "void"] })
      .notNull()
      .default("issued"),
    issueDate: date({ mode: "string" }).notNull(),
    reason: text().notNull(),
    currency: text().notNull(),
    subtotal: integer().notNull(),
    /** Document discount (taken off before tax): percent in bps, or minor units. */
    discountType: text({ enum: ["percent", "amount"] }),
    discountValue: integer(),
    discountTotal: integer().notNull().default(0),
    taxTotal: integer().notNull(),
    total: integer().notNull(),
    appliedAmount: integer().notNull(),
    refundAmount: integer().notNull(),
    clientSnapshot: jsonb().$type<PartySnapshot>(),
    issuerSnapshot: jsonb().$type<PartySnapshot>(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    lastSentAt: timestamp({ withTimezone: true }),
    lastSentTo: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.workspaceId, t.number),
    index().on(t.invoiceId),
    index().on(t.workspaceId, t.issueDate),
  ]
)

export const creditNoteLines = pgTable(
  "credit_note_lines",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    creditNoteId: uuid()
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    description: text().notNull(),
    quantity: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    unitPrice: integer().notNull(),
    taxRateBps: integer().notNull().default(0),
    amount: integer().notNull(),
    taxAmount: integer().notNull(),
  },
  (t) => [index().on(t.creditNoteId, t.position)]
)
