import type { Metadata } from "next"

import { AdminOverview } from "@/features/admin"

export const metadata: Metadata = {
  title: { absolute: "Overview · Billleaf admin" },
}

export default function Page() {
  return <AdminOverview />
}
