"use client"

import { Clock01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { formatDuration } from "@workspace/contracts"
import { Card, CardContent } from "@workspace/ui/components/card"
import Link from "next/link"

import { useWorkspaceStore } from "@/features/workspace"

import { useTimeEntries } from "../api/queries"
import { addDays, weekStart } from "../duration"

/** Dashboard strip: the member's tracked and billable time this week. */
export function WeekTimeCard({ today }: { today: string }) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const from = weekStart(today)
  const week = useTimeEntries({ from, to: addDays(from, 6), memberId: "me" })
  const total = week.data?.totalSeconds ?? 0
  const billable = week.data?.billableSeconds ?? 0
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={Clock01Icon}
            className="size-4 text-muted-foreground"
          />
          Your time this week
        </span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{formatDuration(total)}</span>{" "}
          <span className="text-muted-foreground">tracked</span>
        </span>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{formatDuration(billable)}</span>{" "}
          <span className="text-muted-foreground">billable</span>
        </span>
        <Link
          href={`/${slug}/time`}
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open timesheet
        </Link>
      </CardContent>
    </Card>
  )
}
