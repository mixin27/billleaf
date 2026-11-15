import type { Metadata } from "next"

import { PaymentAccountsSettings } from "@/features/payment-accounts"

export const metadata: Metadata = { title: "Payment methods" }

export default function PaymentMethodsSettingsPage() {
  return <PaymentAccountsSettings />
}
