import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { TwoFactorSettings } from "@/features/auth"

export const metadata: Metadata = { title: "Your account" }

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your account"
        description="Security settings for your sign-in."
      />
      <TwoFactorSettings />
    </div>
  )
}
