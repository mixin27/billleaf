import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { TimePageActions, Tracker } from "@/features/time"

export const metadata: Metadata = { title: "Time" }

export default function TimePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Time"
        description="Track time as you work, or log it afterwards. Billable time can be invoiced from each project."
        actions={<TimePageActions />}
      />
      <Tracker />
    </div>
  )
}
