import type { Metadata } from "next"

import { PrivacyPolicy } from "@/features/marketing"

export const metadata: Metadata = { title: "Privacy Policy" }

export default function PrivacyPage() {
  return <PrivacyPolicy />
}
