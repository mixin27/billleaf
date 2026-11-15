import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  primaryKey,
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
    /** Null = "no project" (allowed, like Clockify); invoicing needs one. */
    projectId: uuid().references(() => projects.id, { onDelete: "restrict" }),
    taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
    /** Null once the member leaves the workspace; their time is kept. */
    memberId: uuid().references(() => member.id, { onDelete: "set null" }),
    /** Name of the person who did the work, kept after they leave. */
    memberName: text().notNull().default(""),
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

/** Workspace-wide labels for time entries (Clockify-style tags). */
export const tags = pgTable(
  "tags",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** One of the UI's tag colour names (e.g. "green"); null = neutral. */
    color: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tags_workspace_name_unique").on(
      t.workspaceId,
      sql`lower(${t.name})`
    ),
  ]
)

export const timeEntryTags = pgTable(
  "time_entry_tags",
  {
    entryId: uuid()
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index().on(t.tagId)]
)
