import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/accept-invitation",
  // Client portal: its own emailed-link session, checked by the API.
  "/portal",
  // Health check for containers and the post-deploy smoke test.
  "/healthz",
  // Public site.
  "/pricing",
  "/terms",
  "/privacy",
]

/**
 * Optimistic auth check (cookie presence only — no DB/API call, per Next 16
 * Proxy guidance). Real authorization happens in the API on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  // "/" is the public home page; signed-in visitors are sent on from there.
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = Boolean(
    getSessionCookie(request, { cookiePrefix: "billleaf" })
  )

  if (!hasSession && !isPublic) {
    const url = new URL("/sign-in", request.url)
    if (pathname !== "/") url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }
  if (hasSession && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/app", request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Skip static assets and Next internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
}
