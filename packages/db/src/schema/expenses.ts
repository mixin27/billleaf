import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { member, organization } from "./auth.js"
import { clients } from "./clients.js"
import { files } from "./files.js"
import { invoices } from "./invoices.js"
import { projects } from "./projects.js"

/** Workspace expense categories (defaults are created on first use). */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    archived: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("expense_categories_workspace_name_unique").on(
      t.workspaceId,
      sql`lower(${t.name})`
    ),
  ]
)

/**
 * Money the business spent. `amount` is the total paid (minor units,
 * tax included); `tax_amount` is the part of it that was tax. Billable
 * expenses can be put on a client's invoice (`invoice_id`, released if that
 * draft is deleted or the invoice voided).
 */
export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    spentOn: date({ mode: "string" }).notNull(),
    vendor: text(),
    description: text(),
    categoryId: uuid().references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    amount: integer().notNull(),
    taxAmount: integer().notNull().default(0),
    currency: text().notNull(),
    paymentMethod: text({
      enum: ["cash", "bank_transfer", "card", "mobile_wallet", "other"],
    })
      .notNull()
      .default("bank_transfer"),
    reference: text(),
    clientId: uuid().references(() => clients.id, { onDelete: "set null" }),
    projectId: uuid().references(() => projects.id, { onDelete: "set null" }),
    billable: boolean().notNull().default(false),
    invoiceId: uuid().references(() => invoices.id, { onDelete: "set null" }),
    receiptFileId: uuid().references(() => files.id, { onDelete: "set null" }),
    createdByMemberId: uuid().references(() => member.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.spentOn),
    index().on(t.clientId),
    index().on(t.projectId),
    index().on(t.invoiceId),
  ]
)
