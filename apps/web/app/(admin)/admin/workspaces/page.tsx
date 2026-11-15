import type { Metadata } from "next"

import { AdminWorkspaces } from "@/features/admin"

export const metadata: Metadata = { title: "Workspaces" }

export default function Page() {
  return <AdminWorkspaces />
}
