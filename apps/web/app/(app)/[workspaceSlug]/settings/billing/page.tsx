import type { Metadata } from "next"

import { BillingSettings } from "@/features/billing"

export const metadata: Metadata = { title: "Billing" }

export default function BillingSettingsPage() {
  return <BillingSettings />
}
