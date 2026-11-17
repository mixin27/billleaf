import { z } from "zod"

import {
  addressSchema,
  optionalEmail,
  optionalText,
  optionalUrl,
} from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"
import {
  TIME_ROUNDING_MODES,
  TIME_ROUNDING_STEPS,
} from "../time/time.schema.js"

/**
 * Workspace business profile — the "from" block on quotes, invoices and
 * receipts, plus document defaults.
 *
 * Tax rates are stored in basis points (1 bp = 0.01%), e.g. 700 = 7%.
 */
export const workspaceProfileSchema = z.object({
  workspaceId: z.string(),
  name: z.string(),
  slug: z.string(),
  legalName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  taxId: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  defaultCurrency: currencyCodeSchema,
  timezone: z.string(),
  locale: z.string(),
  paymentTermsDays: z.number().int(),
  /** Payment reminder days relative to the due date; empty = off. */
  invoiceReminderOffsets: z.array(z.number().int()),
  /** Members submit weeks for approval; only approved time is invoiced (Team). */
  timesheetApprovals: z.boolean(),
  /** Rounding for invoices and reports ("off" = exact). */
  timeRoundingMode: z.enum(TIME_ROUNDING_MODES),
  timeRoundingMinutes: z.number().int(),
  /** Time dated before this day can't be added, changed or deleted. */
  timeLockedBefore: z.iso.date().nullable(),
  defaultTaxRateBps: z.number().int(),
  documentFooter: z.string().nullable(),
  brandColor: z.string().nullable(),
  /** Short-lived presigned URL; null when no logo is set. */
  logoUrl: z.string().nullable(),
  updatedAt: z.iso.datetime(),
})
export type WorkspaceProfile = z.infer<typeof workspaceProfileSchema>

/**
 * When payment reminders can go out, in days relative to the due date
 * (negative = before). Workspaces pick any of these.
 */
export const REMINDER_OFFSETS: readonly number[] = [
  -7, -3, -1, 0, 1, 3, 7, 14, 30,
]

/** "3 days before", "On the due date", "1 day after". */
export function reminderOffsetLabel(days: number) {
  if (days === 0) return "On the due date"
  const n = Math.abs(days)
  return `${n} day${n === 1 ? "" : "s"} ${days < 0 ? "before" : "after"}`
}

export const updateWorkspaceProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    legalName: optionalText(200),
    email: optionalEmail,
    phone: optionalText(50),
    website: optionalUrl,
    taxId: optionalText(50),
    defaultCurrency: currencyCodeSchema,
    timezone: z.string().min(1).max(64),
    locale: z.string().min(2).max(20),
    paymentTermsDays: z.number().int().min(0).max(365),
    invoiceReminderOffsets: z
      .array(
        z
          .number()
          .int()
          .refine((d) => REMINDER_OFFSETS.includes(d), "Pick from the list")
      )
      .max(REMINDER_OFFSETS.length)
      .transform((v) => [...new Set(v)].sort((a, b) => a - b)),
    timesheetApprovals: z.boolean(),
    timeRoundingMode: z.enum(TIME_ROUNDING_MODES),
    timeRoundingMinutes: z
      .number()
      .int()
      .refine(
        (m) => (TIME_ROUNDING_STEPS as readonly number[]).includes(m),
        "Pick from the list"
      ),
    timeLockedBefore: z.iso.date().nullable(),
    defaultTaxRateBps: z.number().int().min(0).max(10_000),
    documentFooter: optionalText(1000),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Hex color like #142B2B")
      .nullish()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
  })
  .extend(addressSchema.shape)
  .partial()
export type UpdateWorkspaceProfileInput = z.input<
  typeof updateWorkspaceProfileSchema
>

/** Delete the workspace: type its URL name (slug) back to confirm. */
export const deleteWorkspaceSchema = z.object({
  confirmSlug: z.string().trim().min(1, "Type the workspace's URL name"),
})
export type DeleteWorkspaceInput = z.input<typeof deleteWorkspaceSchema>

/**
 * Workspace URL names that would clash with the app's own pages
 * (billleaf.com/<slug> is the workspace). Checked when a workspace is
 * created or renamed.
 */
export const RESERVED_WORKSPACE_SLUGS: readonly string[] = [
  "about",
  "accept-invitation",
  "account",
  "admin",
  "api",
  "app",
  "blog",
  "contact",
  "docs",
  "help",
  "healthz",
  "login",
  "logout",
  "new",
  "onboarding",
  "portal",
  "pricing",
  "privacy",
  "security",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signup",
  "status",
  "support",
  "terms",
  "verify-email",
  "www",
]

export const isReservedWorkspaceSlug = (slug: string) =>
  RESERVED_WORKSPACE_SLUGS.includes(slug.trim().toLowerCase())
