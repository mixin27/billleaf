import {
  date,
  uniqueIndex,
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
    /** Time estimate in minutes; progress and alerts at 80% / 100%. */
    estimateMinutes: integer(),
    /** Money estimate (minor units, project currency) for hourly projects. */
    estimateAmount: integer(),
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
    /** Billable rate per hour (project currency); overrides the project's. */
    hourlyRate: integer(),
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index().on(t.projectId, t.status, t.position),
    index().on(t.workspaceId),
  ]
)

/**
 * Billable and cost rates of a member (minor units per hour, in `currency`,
 * the workspace default currency when saved). A member rate applies to
 * hourly projects in the same currency without a project or task rate.
 */
export const memberRates = pgTable(
  "member_rates",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: uuid()
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    currency: text().notNull(),
    hourlyRate: integer(),
    /** What an hour of this member's time costs the business. */
    costRate: integer(),
    ...timestamps,
  },
  (t) => [uniqueIndex("member_rates_member_unique").on(t.memberId)]
)

/**
 * Budget alerts already sent: one per project, estimate kind, threshold and
 * estimate value, so each goes out once and raising the estimate re-arms it.
 */
export const projectBudgetAlerts = pgTable(
  "project_budget_alerts",
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text({ enum: ["hours", "amount"] }).notNull(),
    /** Percent of the estimate: 80 or 100. */
    threshold: integer().notNull(),
    /** The estimate (minutes or minor units) the alert was sent for. */
    estimate: integer().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_budget_alerts_unique").on(
      t.projectId,
      t.kind,
      t.threshold,
      t.estimate
    ),
  ]
)
