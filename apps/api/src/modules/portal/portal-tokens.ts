import { createHash, randomBytes } from "node:crypto"

/** 256-bit random token, URL-safe. Only its hash is stored. */
export function newPortalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url")
  return { token, hash: hashPortalToken(token) }
}

export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export const PORTAL_COOKIE = "billleaf_portal"
export const SIGN_IN_TTL_MS = 20 * 60_000
export const LINK_TTL_MS = 14 * 24 * 3600_000
export const SESSION_TTL_MS = 30 * 24 * 3600_000

/** Read one cookie from a raw Cookie header. */
export function readCookie(
  header: string | string[] | undefined,
  name: string
): string | null {
  const raw = Array.isArray(header) ? header.join(";") : (header ?? "")
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=")
    if (k === name) return decodeURIComponent(v.join("="))
  }
  return null
}

export function portalCookie(
  value: string,
  opts: { maxAgeSeconds: number; secure: boolean; domain?: string }
): string {
  return [
    `${PORTAL_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAgeSeconds}`,
    opts.secure ? "Secure" : null,
    opts.domain ? `Domain=${opts.domain}` : null,
  ]
    .filter(Boolean)
    .join("; ")
}
