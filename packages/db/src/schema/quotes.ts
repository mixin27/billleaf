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

/** Frozen party details (see PartySnapshot in @workspace/contracts). */
type PartySnapshot = {
  name: string
  legalName?: string | null
  email?: string | null
  phone?: string | null
  taxId?: string | null
  addressLines: string[]
}

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Assigned when the quote is sent (gap-free per workspace); null while draft. */
    number: text(),
    status: text({ enum: ["draft", "sent", "accepted", "declined"] })
      .notNull()
      .default("draft"),
    title: text(),
    currency: text().notNull(),
    issueDate: date({ mode: "string" }).notNull(),
    validUntil: date({ mode: "string" }),
    notes: text(),
    terms: text(),
    subtotal: integer().notNull().default(0),
    taxTotal: integer().notNull().default(0),
    total: integer().notNull().default(0),
    clientSnapshot: jsonb().$type<PartySnapshot>(),
    issuerSnapshot: jsonb().$type<PartySnapshot>(),
    sentAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    declinedAt: timestamp({ withTimezone: true }),
    /** Who accepted or declined, and how (recorded by a member, or the client in the portal). */
    respondedByName: text(),
    respondedVia: text({ enum: ["manual", "portal"] }),
    declineReason: text(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.workspaceId, t.number),
    index().on(t.workspaceId, t.id),
    index().on(t.workspaceId, t.status),
    index().on(t.clientId),
    index("quotes_workspace_number_lower_idx").on(
      t.workspaceId,
      sql`lower(${t.number})`
    ),
  ]
)

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    quoteId: uuid()
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    description: text().notNull(),
    quantity: numeric({ precision: 14, scale: 3, mode: "number" }).notNull(),
    unitPrice: integer().notNull(),
    taxRateBps: integer().notNull().default(0),
    amount: integer().notNull(),
    taxAmount: integer().notNull(),
  },
  (t) => [index().on(t.quoteId, t.position)]
)
