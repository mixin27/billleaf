import type { Metadata } from "next"

import { TermsOfService } from "@/features/marketing"

export const metadata: Metadata = { title: "Terms of Service" }

export default function TermsPage() {
  return <TermsOfService />
}
