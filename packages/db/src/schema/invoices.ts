import { sql } from "drizzle-orm"
import {
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
    taxTotal: integer().notNull().default(0),
    total: integer().notNull().default(0),
    /** Maintained by the Payments module; 0 until payments are recorded. */
    amountPaid: integer().notNull().default(0),
    clientSnapshot: jsonb().$type<PartySnapshot>(),
    issuerSnapshot: jsonb().$type<PartySnapshot>(),
    issuedAt: timestamp({ withTimezone: true }),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    lastSentAt: timestamp({ withTimezone: true }),
    lastSentTo: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.workspaceId, t.number),
    unique().on(t.quoteId),
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
