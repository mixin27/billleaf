/**
 * Workspace business profile (1:1 with `organization`). Name/slug/logo stay on
 * Better Auth's `organization`; everything that appears on documents lives here.
 */
import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core"

import { timestamps } from "./_shared.js"
import { organization } from "./auth.js"
import { files } from "./files.js"

export const workspaceProfiles = pgTable("workspace_profiles", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  legalName: text(),
  email: text(),
  phone: text(),
  website: text(),
  taxId: text(),
  addressLine1: text(),
  addressLine2: text(),
  city: text(),
  state: text(),
  postalCode: text(),
  country: text(),
  defaultCurrency: text().notNull().default("USD"),
  timezone: text().notNull().default("UTC"),
  locale: text().notNull().default("en-US"),
  paymentTermsDays: integer().notNull().default(14),
  /**
   * Automatic payment reminders: days relative to an invoice's due date
   * (-3 = three days before, 0 = on the day, 7 = a week late). Empty = off.
   */
  invoiceReminderOffsets: integer().array().notNull().default([]),
  /**
   * Default billable rate per hour (minor units, in `defaultCurrency`), used
   * for hourly projects without a more specific rate. Null = none.
   */
  defaultHourlyRate: integer(),
  /**
   * Team plan: members submit weeks for approval; approved weeks lock and
   * only approved time can be invoiced.
   */
  timesheetApprovals: boolean().notNull().default(false),
  /**
   * Rounding for invoices and reports: off | up | nearest | down, to a step
   * in minutes. Each entry rounds on its own; tracked time stays exact.
   */
  timeRoundingMode: text({ enum: ["off", "up", "nearest", "down"] })
    .notNull()
    .default("off"),
  timeRoundingMinutes: integer().notNull().default(15),
  /** Time dated before this day can't be added, changed or deleted. */
  timeLockedBefore: date({ mode: "string" }),
  /** Basis points: 700 = 7.00% */
  defaultTaxRateBps: integer().notNull().default(0),
  documentFooter: text(),
  brandColor: text(),
  /** PNG/JPEG shown in the app and on documents. */
  logoFileId: uuid().references(() => files.id, { onDelete: "set null" }),
  ...timestamps,
})
