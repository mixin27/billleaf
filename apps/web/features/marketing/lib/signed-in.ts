import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"

/**
 * Whether the visitor has a session cookie (server components). Optimistic,
 * like the proxy: an expired session just lands on sign-in from /app.
 */
export async function hasSessionCookie() {
  return Boolean(
    getSessionCookie(await headers(), { cookiePrefix: "billleaf" })
  )
}
