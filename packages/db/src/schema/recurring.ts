import {
  date,
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
import { clients } from "./clients.js"

type StoredLine = {
  description: string
  quantity: number
  unitPrice: number
  taxRateBps: number
}

export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid()
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    title: text(),
    currency: text().notNull(),
    /** Template lines copied into each generated invoice. */
    lines: jsonb().$type<StoredLine[]>().notNull(),
    every: integer().notNull().default(1),
    unit: text({ enum: ["week", "month", "year"] })
      .notNull()
      .default("month"),
    startDate: date({ mode: "string" }).notNull(),
    /** Day of month to keep when months are shorter (from startDate). */
    anchorDay: integer().notNull(),
    endDate: date({ mode: "string" }),
    maxOccurrences: integer(),
    /** Next period to generate; null once ended. */
    nextRunDate: date({ mode: "string" }),
    dueDays: integer(),
    mode: text({ enum: ["draft", "send"] })
      .notNull()
      .default("draft"),
    status: text({ enum: ["active", "paused", "ended"] })
      .notNull()
      .default("active"),
    notes: text(),
    terms: text(),
    generatedCount: integer().notNull().default(0),
    lastRunAt: timestamp({ withTimezone: true }),
    lastError: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.id),
    index("recurring_due_idx").on(t.status, t.nextRunDate),
  ]
)
