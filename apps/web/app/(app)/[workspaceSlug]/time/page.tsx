import type { Metadata } from "next"

import { Timesheet } from "@/features/time"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Time" }

export default function TimePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Time"
        description="Your week at a glance. Billable time can be invoiced from each project."
      />
      <Timesheet />
    </div>
  )
}
