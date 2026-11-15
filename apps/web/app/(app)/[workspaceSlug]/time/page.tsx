import type { Metadata } from "next"

import { Timesheet } from "@/features/time"

export const metadata: Metadata = { title: "Time" }

export default function TimePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time</h1>
        <p className="text-sm text-muted-foreground">
          Your week at a glance. Billable time can be invoiced from each
          project.
        </p>
      </div>
      <Timesheet />
    </div>
  )
}
