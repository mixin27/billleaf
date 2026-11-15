import type { Metadata } from "next"

import { AdminApprovals } from "@/features/admin"

export const metadata: Metadata = { title: "Approvals" }

export default function Page() {
  return <AdminApprovals />
}
