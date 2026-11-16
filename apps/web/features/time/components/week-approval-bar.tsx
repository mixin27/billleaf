"use client"

import type { Timesheet } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useSubmitWeek, useWithdrawWeek } from "../api/approvals"
import { weekStart } from "../duration"

export const APPROVAL_LABELS = {
  submitted: "Waiting for approval",
  approved: "Approved",
  rejected: "Sent back",
} as const

export const APPROVAL_BADGE = {
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
} as const

/**
 * Above the timesheet when the workspace uses approvals: the week's status
 * and the one thing you can do next (submit, withdraw, submit again).
 */
export function WeekApprovalBar({
  sheet,
  today,
  weekTotal,
  locale,
}: {
  sheet: Timesheet
  today: string
  weekTotal: number
  locale?: string
}) {
  const submit = useSubmitWeek()
  const withdraw = useWithdrawWeek()
  if (!sheet.approvalsEnabled) return null
  const a = sheet.approval
  const future = sheet.weekStart > weekStart(today)
  const reviewed = a?.reviewedAt
    ? `${a.reviewedByName ?? "An approver"}, ${formatDate(a.reviewedAt.slice(0, 10), locale)}`
    : null

  const onSubmit = () =>
    submit.mutate(sheet.weekStart, {
      onSuccess: () => toast.success("Week submitted for approval"),
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 text-sm",
        a?.status === "rejected" && "border-destructive/40 bg-destructive/5",
        a?.status === "approved" && "bg-primary/5"
      )}
    >
      <Badge variant={a ? APPROVAL_BADGE[a.status] : "outline"}>
        {a ? APPROVAL_LABELS[a.status] : "Not submitted"}
      </Badge>
      <div className="min-w-0 flex-1 text-muted-foreground">
        {!a ? (
          <span>
            Submit the week when it&apos;s complete. It can&apos;t change while
            it&apos;s waiting or approved, and only approved time is invoiced.
          </span>
        ) : a.status === "submitted" ? (
          <span>
            Submitted {formatDate(a.submittedAt.slice(0, 10), locale)}. Withdraw
            it to make changes.
          </span>
        ) : a.status === "approved" ? (
          <span>
            By {reviewed}. Locked; ask an approver to reopen it.
            {a.note ? (
              <span className="block text-foreground">“{a.note}”</span>
            ) : null}
          </span>
        ) : (
          <span>
            By {reviewed}. Make the changes, then submit it again.
            {a.note ? (
              <span className="block font-medium text-foreground">
                “{a.note}”
              </span>
            ) : null}
          </span>
        )}
      </div>
      {!a || a.status === "rejected" ? (
        <Button
          size="sm"
          disabled={submit.isPending || future || weekTotal === 0}
          title={
            future
              ? "You can't submit a future week"
              : weekTotal === 0
                ? "There's no time in this week"
                : undefined
          }
          onClick={onSubmit}
        >
          {a ? "Submit again" : "Submit for approval"}
        </Button>
      ) : a.status === "submitted" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={withdraw.isPending}
          onClick={() =>
            withdraw.mutate(sheet.weekStart, {
              onSuccess: () => toast.success("Submission withdrawn"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Withdraw
        </Button>
      ) : null}
    </div>
  )
}
