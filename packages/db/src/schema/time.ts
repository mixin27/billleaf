import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { member, organization } from "./auth.js"
import { invoices } from "./invoices.js"
import { projects, tasks } from "./projects.js"

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    memberId: uuid()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    description: text(),
    /** Workspace-local date of startedAt (timesheet grouping). */
    entryDate: date({ mode: "string" }).notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    /** Null while the timer runs. */
    endedAt: timestamp({ withTimezone: true }),
    durationSeconds: integer(),
    billable: boolean().notNull().default(true),
    /** Set when pulled into an invoice; released (null) if that draft is deleted. */
    invoiceId: uuid().references(() => invoices.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.entryDate),
    index().on(t.projectId),
    index().on(t.memberId, t.entryDate),
    index().on(t.invoiceId),
    // One running timer per member.
    uniqueIndex("time_entries_one_running_per_member")
      .on(t.memberId)
      .where(sql`${t.endedAt} is null`),
  ]
)
