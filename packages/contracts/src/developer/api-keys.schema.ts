import { z } from "zod"

import { type Permission, PERMISSIONS } from "../iam/permissions.js"

/**
 * Developer API: workspace API keys. A key is sent as
 * `Authorization: Bearer blk_…`, acts as the member who created it, and is
 * limited to its scopes (never more than that member can do now).
 */

/** Resources a key can be given access to. Everything else is off limits. */
const KEY_RESOURCES = [
  "workspace",
  "client",
  "quote",
  "contract",
  "project",
  "time",
  "invoice",
  "payment",
  "expense",
] as const

/** Never grantable, even within the resources above. */
const KEY_EXCLUDED: Permission[] = [
  "workspace.update",
  "workspace.delete",
  "workspace.export",
]

/** Permission keys an API key may hold. */
export const API_KEY_SCOPES: readonly Permission[] = PERMISSIONS.filter(
  (p) =>
    (KEY_RESOURCES as readonly string[]).includes(p.resource) &&
    !KEY_EXCLUDED.includes(p.key)
).map((p) => p.key)

export function isApiKeyScope(v: string): v is Permission {
  return (API_KEY_SCOPES as readonly string[]).includes(v)
}

export const API_KEY_PRESETS = {
  read: {
    label: "Read only",
    scopes: API_KEY_SCOPES.filter((k) => k.endsWith(".read")),
  },
  write: { label: "Read & write", scopes: [...API_KEY_SCOPES] },
} as const

export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const

/** Keys look like `blk_<43 chars>`; this many characters are shown. */
export const API_KEY_PREFIX_LENGTH = 12

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** e.g. `blk_Ab12Cd34`: enough to recognise a key, useless to use it. */
  prefix: z.string(),
  scopes: z.array(z.string()),
  createdBy: z.object({ memberId: z.string(), name: z.string() }).nullable(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  status: z.enum(["active", "expired", "revoked"]),
  createdAt: z.iso.datetime(),
})
export type ApiKey = z.infer<typeof apiKeySchema>

export const apiKeyListSchema = z.object({
  items: z.array(apiKeySchema),
  /** False on plans without the Developer API: keys exist but don't work. */
  available: z.boolean(),
})
export type ApiKeyList = z.infer<typeof apiKeyListSchema>

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  scopes: z
    .array(z.string())
    .min(1, "Pick at least one permission")
    .refine((v) => v.every(isApiKeyScope), "Unknown or unavailable permission")
    .transform((v) => [...new Set(v)] as Permission[]),
  /** Days until it stops working; null = never. */
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(null),
})
export type CreateApiKeyInput = z.input<typeof createApiKeySchema>

/** Returned once, on create: the only time the full key is shown. */
export const createdApiKeySchema = z.object({
  apiKey: apiKeySchema,
  key: z.string(),
})
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>
