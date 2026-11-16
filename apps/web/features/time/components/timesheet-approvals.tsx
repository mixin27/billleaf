"use client"

import {
  formatDuration,
  type ApprovalStatus,
  type TimesheetApproval,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useReviewWeek, useTimesheetApprovals } from "../api/approvals"
import { useTimesheet } from "../api/reports"
import { addDays } from "../duration"
import { APPROVAL_BADGE, APPROVAL_LABELS } from "./week-approval-bar"

const FILTERS = ["submitted", "approved", "rejected", "all"] as const
const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  submitted: "Waiting",
  approved: "Approved",
  rejected: "Sent back",
  all: "All",
}

/** Time → Approvals (approvers): submitted weeks to approve or send back. */
export function TimesheetApprovals() {
  const locale = useWorkspaceProfile().data?.locale
  const [filter, setFilter] = useQueryState(
    "status",
    parseAsStringLiteral(FILTERS).withDefault("submitted")
  )
  const list = useTimesheetApprovals(
    filter === "all" ? {} : { status: filter as ApprovalStatus }
  )
  const [reviewing, setReviewing] = React.useState<TimesheetApproval | null>(
    null
  )
  const weekText = (start: string) =>
    `${formatDate(start, locale)} – ${formatDate(addDays(start, 6), locale)}`

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={filter}
        onValueChange={(v) =>
          void setFilter(v === "submitted" ? null : (v as typeof filter))
        }
      >
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f} value={f}>
              {FILTER_LABELS[f]}
              {f === "submitted" && list.data?.pendingCount ? (
                <Badge variant="secondary" className="ml-1.5 tabular-nums">
                  {list.data.pendingCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.error ? (
        <p className="text-sm text-destructive">{list.error.message}</p>
      ) : list.data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {filter === "submitted"
            ? "No timesheets are waiting for approval."
            : "Nothing here yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Member</th>
                <th className="px-3 py-2 font-medium">Week</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                  Billable
                </th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">
                  Status
                </th>
                <th className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 font-medium">{a.memberName}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {weekText(a.weekStart)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDuration(a.totalSeconds)}
                  </td>
                  <td className="hidden px-3 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                    {formatDuration(a.billableSeconds)}
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <Badge variant={APPROVAL_BADGE[a.status]}>
                      {APPROVAL_LABELS[a.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant={a.status === "submitted" ? "default" : "outline"}
                      onClick={() => setReviewing(a)}
                    >
                      {a.status === "submitted" ? "Review" : "View"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReviewDialog
        approval={reviewing}
        weekText={reviewing ? weekText(reviewing.weekStart) : ""}
        onOpenChange={(o) => !o && setReviewing(null)}
      />
    </div>
  )
}

/** The member's week, read-only, with approve / send back (or reopen). */
function ReviewDialog({
  approval,
  weekText,
  onOpenChange,
}: {
  approval: TimesheetApproval | null
  weekText: string
  onOpenChange: (open: boolean) => void
}) {
  const locale = useWorkspaceProfile().data?.locale
  const sheet = useTimesheet(
    approval?.weekStart ?? "",
    approval?.memberId,
    Boolean(approval)
  )
  const review = useReviewWeek()
  const [note, setNote] = React.useState("")
  React.useEffect(() => setNote(""), [approval?.id])
  const weekday = new Intl.DateTimeFormat(locale ?? "en-US", {
    weekday: "short",
    timeZone: "UTC",
  })

  const act = (action: "approve" | "reject") =>
    approval &&
    review.mutate(
      { id: approval.id, action, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(
            action === "approve"
              ? `Approved ${approval.memberName}'s week`
              : approval.status === "approved"
                ? "Week reopened"
                : `Sent back to ${approval.memberName}`
          )
          onOpenChange(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  const rows = sheet.data?.rows ?? []
  const dayTotals = Array.from({ length: 7 }, (_, i) =>
    rows.reduce((s, r) => s + (r.seconds[i] ?? 0), 0)
  )
  const total = dayTotals.reduce((a, b) => a + b, 0)
  const noteOk = note.trim().length >= 3

  return (
    <Dialog open={approval !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {approval?.memberName} · {weekText}
          </DialogTitle>
          <DialogDescription>
            {approval?.status === "submitted"
              ? `Submitted ${formatDate(approval.submittedAt.slice(0, 10), locale)}. Approve it, or send it back with what to change.`
              : approval?.status === "approved"
                ? `Approved by ${approval.reviewedByName ?? "an approver"}. Reopen it to let ${approval.memberName} change it.`
                : approval
                  ? `Sent back by ${approval.reviewedByName ?? "an approver"}: “${approval.note}”`
                  : null}
          </DialogDescription>
        </DialogHeader>

        {sheet.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">
                    Project / task
                  </th>
                  {(sheet.data?.days ?? []).map((d) => (
                    <th
                      key={d}
                      className="w-14 px-1 py-2 text-center font-medium"
                    >
                      {weekday.format(new Date(`${d}T00:00:00Z`))}
                    </th>
                  ))}
                  <th className="w-16 px-3 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={`${r.projectId}|${r.taskId}`}>
                    <td className="max-w-52 truncate px-3 py-1.5">
                      {r.projectName ?? (
                        <span className="text-muted-foreground">
                          No project
                        </span>
                      )}
                      {r.taskTitle ? `: ${r.taskTitle}` : ""}
                    </td>
                    {r.seconds.map((s, i) => (
                      <td
                        key={i}
                        className="px-1 py-1.5 text-center tabular-nums"
                      >
                        {s ? formatDuration(s) : ""}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {formatDuration(r.seconds.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/40 text-xs font-medium">
                  <td className="px-3 py-2">Total</td>
                  {dayTotals.map((s, i) => (
                    <td key={i} className="px-1 py-2 text-center tabular-nums">
                      {s ? formatDuration(s) : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatDuration(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {approval && approval.status !== "rejected" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-note">
              Note{" "}
              <span className="font-normal text-muted-foreground">
                {approval.status === "submitted"
                  ? "(needed to send back; optional when approving)"
                  : "(needed to reopen)"}
              </span>
            </Label>
            <Textarea
              id="review-note"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {approval?.status === "submitted" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!noteOk || review.isPending}
                title={noteOk ? undefined : "Add a note saying what to change"}
                onClick={() => act("reject")}
              >
                Send back
              </Button>
              <Button
                type="button"
                disabled={review.isPending}
                onClick={() => act("approve")}
              >
                Approve
              </Button>
            </>
          ) : approval?.status === "approved" ? (
            <Button
              type="button"
              variant="outline"
              disabled={!noteOk || review.isPending}
              onClick={() => act("reject")}
            >
              Reopen
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
