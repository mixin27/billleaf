import type { Metadata } from "next"

import { AdminPricing } from "@/features/admin"

export const metadata: Metadata = { title: "Pricing" }

export default function Page() {
  return <AdminPricing />
}
