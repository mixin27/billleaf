import type { Metadata } from "next"

import { AdminJobs } from "@/features/admin"

export const metadata: Metadata = { title: "Jobs" }

export default function Page() {
  return <AdminJobs />
}
