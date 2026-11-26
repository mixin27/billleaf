import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { organization } from "./auth.js"
import { clients } from "./clients.js"
import { invoices } from "./invoices.js"

type PartySnapshot = {
  name: string
  legalName?: string | null
  email?: string | null
  phone?: string | null
  taxId?: string | null
  addressLines: string[]
}

export const payments = pgTable(
  "payments",
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
    /** Minor units, always in the invoice currency. */
    amount: integer().notNull(),
    currency: text().notNull(),
    paidOn: date({ mode: "string" }).notNull(),
    method: text({
      enum: [
        "bank_transfer",
        "mobile_wallet",
        "card",
        "cash",
        "cheque",
        "online",
        "other",
      ],
    }).notNull(),
    reference: text(),
    notes: text(),
    /** `void`: recorded by mistake, the money never arrived. */
    status: text({ enum: ["completed", "refunded", "void"] })
      .notNull()
      .default("completed"),
    refundedAt: timestamp({ withTimezone: true }),
    refundReason: text(),
    voidedAt: timestamp({ withTimezone: true }),
    voidReason: text(),
    recordedBy: uuid(),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.id),
    index().on(t.invoiceId),
    index().on(t.clientId),
  ]
)

/** One receipt per payment; numbered RCT-0001… per workspace, issued with the payment. */
export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    number: text().notNull(),
    /** Invoice balance right after this payment (receipts never change). */
    balanceAfter: integer().notNull().default(0),
    /** Frozen at issue, like quotes and invoices. */
    clientSnapshot: jsonb().$type<PartySnapshot>().notNull(),
    issuerSnapshot: jsonb().$type<PartySnapshot>().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp({ withTimezone: true }),
    lastSentAt: timestamp({ withTimezone: true }),
    lastSentTo: text(),
    ...timestamps,
  },
  (t) => [unique().on(t.workspaceId, t.number), unique().on(t.paymentId)]
)
