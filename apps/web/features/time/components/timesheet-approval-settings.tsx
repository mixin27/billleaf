"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
import Link from "next/link"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import {
  useUpdateWorkspaceProfile,
  useWorkspaceProfile,
  useWorkspaceStore,
} from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { docsUrl } from "@/lib/docs"

import { useTimesheetApprovals } from "../api/approvals"

/** Settings → General: turn timesheet approvals on or off (Team plan). */
export function TimesheetApprovalSettings() {
  const profile = useWorkspaceProfile()
  const save = useUpdateWorkspaceProfile()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { can } = usePermissions()
  const status = useTimesheetApprovals({ status: "submitted" })
  if (!profile.data || !status.data) return null
  const on = profile.data.timesheetApprovals
  const available = status.data.available
  const editable = can("workspace.update") && (available || on)

  return (
    <Card id="timesheet-approvals">
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-base font-semibold">Timesheet approvals</p>
          <p className="text-sm text-muted-foreground">
            Members submit each week of time; approvers (Owner and Admin, or any
            role you give &ldquo;Approve or reject submitted timesheets&rdquo;)
            approve it or send it back with a note. Submitted and approved weeks
            are locked, and only approved time can be invoiced.{" "}
            <a
              className="underline"
              href={docsUrl("/docs/work/timesheet-approvals")}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </p>
        </div>
        {available ? null : (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">Approvals are on the Team plan.</p>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${slug}/settings/billing`} />}
            >
              See plans
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="timesheet-approvals-on"
            checked={on}
            disabled={!editable || save.isPending}
            onCheckedChange={(v) =>
              save.mutate(
                { timesheetApprovals: v === true },
                {
                  onSuccess: () =>
                    toast.success(
                      v === true
                        ? "Timesheet approvals turned on"
                        : "Timesheet approvals turned off"
                    ),
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          />
          <Label htmlFor="timesheet-approvals-on" className="font-normal">
            Require approval before time can be invoiced
          </Label>
        </div>
        {on && !available ? (
          <p className="text-xs text-muted-foreground">
            Turned on, but your plan doesn&apos;t include approvals, so they
            aren&apos;t applied: weeks aren&apos;t locked and all time can be
            invoiced.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
