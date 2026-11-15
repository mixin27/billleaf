import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { id, timestamps } from "./_shared.js"
import { member, organization } from "./auth.js"
import { clients } from "./clients.js"
import { quotes } from "./quotes.js"

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Null = internal project. */
    clientId: uuid().references(() => clients.id, { onDelete: "restrict" }),
    quoteId: uuid().references(() => quotes.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    status: text({ enum: ["active", "on_hold", "completed", "archived"] })
      .notNull()
      .default("active"),
    billing: text({ enum: ["fixed", "hourly", "non_billable"] })
      .notNull()
      .default("hourly"),
    currency: text().notNull(),
    /** Fixed price (minor units) when billing = fixed. */
    budgetAmount: integer(),
    /** Per hour (minor units) when billing = hourly. */
    hourlyRate: integer(),
    startDate: date({ mode: "string" }),
    dueDate: date({ mode: "string" }),
    ...timestamps,
  },
  (t) => [
    index().on(t.workspaceId, t.status),
    index().on(t.workspaceId, t.id),
    index().on(t.clientId),
  ]
)

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    notes: text(),
    status: text({ enum: ["todo", "in_progress", "done"] })
      .notNull()
      .default("todo"),
    /** Fractional ordering within a status column (midpoint insertion). */
    position: doublePrecision().notNull(),
    dueDate: date({ mode: "string" }),
    assigneeMemberId: uuid().references(() => member.id, {
      onDelete: "set null",
    }),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.projectId, t.status, t.position),
    index().on(t.workspaceId),
  ]
)
