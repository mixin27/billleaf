import { getSessionCookie } from "better-auth/cookies"
import { headers } from "next/headers"

import { HomeRedirect } from "@/components/layout/home-redirect"
import { Landing, MarketingShell } from "@/features/marketing"

/**
 * `/`: the public home page, or straight into the app when signed in
 * (session cookie present; the app checks the session itself).
 */
export default async function HomePage() {
  const signedIn = Boolean(
    getSessionCookie(await headers(), { cookiePrefix: "billleaf" })
  )
  if (signedIn) return <HomeRedirect />
  return (
    <MarketingShell>
      <Landing />
    </MarketingShell>
  )
}
