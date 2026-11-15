import { z } from "zod"

import {
  addressSchema,
  optionalEmail,
  optionalText,
  optionalUrl,
} from "../common/locale.js"
import { currencyCodeSchema } from "../common/money.js"

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
  defaultTaxRateBps: z.number().int(),
  documentFooter: z.string().nullable(),
  brandColor: z.string().nullable(),
  /** Short-lived presigned URL; null when no logo is set. */
  logoUrl: z.string().nullable(),
  updatedAt: z.iso.datetime(),
})
export type WorkspaceProfile = z.infer<typeof workspaceProfileSchema>

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
