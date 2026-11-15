import type { Metadata } from "next"

import { SubscriptionPay } from "@/features/billing"

export const metadata: Metadata = { title: "Pay for your plan" }

export default function SubscriptionPayPage() {
  return <SubscriptionPay />
}
