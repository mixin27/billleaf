import type { Metadata } from "next"
import { Suspense } from "react"

import { TestBilling } from "@/features/billing"

export const metadata: Metadata = { title: "Test billing" }

export default function TestBillingPage() {
  return (
    <Suspense>
      <TestBilling />
    </Suspense>
  )
}
