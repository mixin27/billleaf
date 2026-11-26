import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { id, softDelete, timestamps } from "./_shared.js"
import { member, organization } from "./auth.js"
import { files } from "./files.js"

/** Optional entry fields a book shows (CashBook's "entry field settings"). */
export type CashbookFields = {
  contact: boolean
  category: boolean
  mode: boolean
}

/**
 * A cashbook: a running balance of money in and out, in one currency.
 * Separate from expenses and payments (ADR-0019). The balance is never
 * stored; it's the sum of the book's entries.
 */
export const cashbooks = pgTable(
  "cashbooks",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    currency: text().notNull(),
    fields: jsonb()
      .$type<CashbookFields>()
      .notNull()
      .default({ contact: true, category: true, mode: true }),
    archivedAt: timestamp({ withTimezone: true }),
    createdByMemberId: uuid().references(() => member.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId)]
)

/**
 * Who can use a book, and how (ADR-0019). Workspace members with
 * `cashbook.manage` can use every book without a row here.
 */
export const cashbookMembers = pgTable(
  "cashbook_members",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bookId: uuid()
      .notNull()
      .references(() => cashbooks.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    role: text({ enum: ["owner", "admin", "operator", "viewer"] }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cashbook_members_book_member_unique").on(t.bookId, t.memberId),
    index().on(t.memberId),
  ]
)

const bookList = (name: string) =>
  pgTable(
    name,
    {
      id: id(),
      workspaceId: uuid()
        .notNull()
        .references(() => organization.id, { onDelete: "cascade" }),
      bookId: uuid()
        .notNull()
        .references(() => cashbooks.id, { onDelete: "cascade" }),
      name: text().notNull(),
      archived: boolean().notNull().default(false),
      ...timestamps,
    },
    (t) => [
      uniqueIndex(`${name}_book_name_unique`).on(
        t.bookId,
        sql`lower(${t.name})`
      ),
    ]
  )

/** A book's categories (e.g. Sales, Stock, Rent). */
export const cashbookCategories = bookList("cashbook_categories")

/** A book's payment modes (e.g. Cash, KBZPay, Online). */
export const cashbookModes = bookList("cashbook_modes")

/**
 * Money in or out of a book. `amount` is positive, in minor units of the
 * book's currency; `type` says which way it went. Deleted entries are
 * kept (soft delete) for the audit trail.
 */
export const cashbookEntries = pgTable(
  "cashbook_entries",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    bookId: uuid()
      .notNull()
      .references(() => cashbooks.id, { onDelete: "cascade" }),
    type: text({ enum: ["in", "out"] }).notNull(),
    amount: integer().notNull(),
    entryDate: date({ mode: "string" }).notNull(),
    entryTime: time({ precision: 0 }).notNull(),
    remark: text(),
    contactName: text(),
    categoryId: uuid().references(() => cashbookCategories.id, {
      onDelete: "set null",
    }),
    modeId: uuid().references(() => cashbookModes.id, {
      onDelete: "set null",
    }),
    createdByMemberId: uuid().references(() => member.id, {
      onDelete: "set null",
    }),
    updatedByMemberId: uuid().references(() => member.id, {
      onDelete: "set null",
    }),
    /** Set by imports so the same row is never imported twice. */
    importKey: text(),
    ...softDelete,
    ...timestamps,
  },
  (t) => [
    index().on(t.bookId, t.entryDate, t.entryTime),
    uniqueIndex("cashbook_entries_book_import_unique")
      .on(t.bookId, t.importKey)
      .where(sql`import_key is not null`),
  ]
)

/** Photos and PDFs attached to an entry. */
export const cashbookEntryFiles = pgTable(
  "cashbook_entry_files",
  {
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entryId: uuid()
      .notNull()
      .references(() => cashbookEntries.id, { onDelete: "cascade" }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.entryId, t.fileId] })]
)
