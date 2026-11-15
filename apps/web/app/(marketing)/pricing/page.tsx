import type { Metadata } from "next"

import { Pricing } from "@/features/marketing"

export const metadata: Metadata = {
  title: "Pricing",
  description: "Billleaf plans: start free, upgrade when you grow.",
}

export default function PricingPage() {
  return <Pricing />
}
