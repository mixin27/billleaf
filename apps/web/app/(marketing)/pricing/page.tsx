import type { Metadata } from "next"

import { hasSessionCookie, Pricing } from "@/features/marketing"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Billleaf plans: start free, upgrade when you grow.",
}

export default async function PricingPage() {
  return <Pricing signedIn={await hasSessionCookie()} />
}
