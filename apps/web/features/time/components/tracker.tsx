"use client"

import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile } from "@/features/workspace"

import { ClockifyImport } from "./clockify-import"
import { useTimesheetApprovals } from "../api/approvals"
import { TimeCalendar } from "./time-calendar"
import { TimeReports } from "./time-reports"
import { TimerBar } from "./timer-bar"
import { TimesheetApprovals } from "./timesheet-approvals"
import { TimesheetGrid } from "./timesheet-grid"
import { TrackerList } from "./tracker-list"

const TABS = [
  "tracker",
  "calendar",
  "timesheet",
  "approvals",
  "reports",
  "import",
] as const

/** The Time page: Tracker · Calendar · Timesheet · Approvals · Reports · Import (`?tab=`). */
export function Tracker() {
  const { can } = usePermissions()
  const profile = useWorkspaceProfile()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.data?.timezone ?? "UTC",
  }).format(new Date())
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS).withDefault("tracker")
  )
  const canImport = can("time.manage")
  const canApprove =
    can("time.approve") && Boolean(profile.data?.timesheetApprovals)
  const pending = useTimesheetApprovals({ status: "submitted" }, canApprove)
  const current =
    (tab === "import" && !canImport) || (tab === "approvals" && !canApprove)
      ? "tracker"
      : tab

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        value={current}
        onValueChange={(v) =>
          void setTab(v === "tracker" ? null : (v as (typeof TABS)[number]))
        }
      >
        <TabsList>
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="timesheet">Timesheet</TabsTrigger>
          {canApprove ? (
            <TabsTrigger value="approvals">
              Approvals
              {pending.data?.enabled && pending.data.pendingCount ? (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
                  {pending.data.pendingCount}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {canImport ? <TabsTrigger value="import">Import</TabsTrigger> : null}
        </TabsList>
      </Tabs>
      {current === "tracker" ? (
        <>
          <TimerBar today={today} />
          <TrackerList today={today} />
        </>
      ) : current === "calendar" ? (
        <TimeCalendar today={today} />
      ) : current === "timesheet" ? (
        <TimesheetGrid today={today} />
      ) : current === "approvals" ? (
        <TimesheetApprovals />
      ) : current === "reports" ? (
        <TimeReports today={today} />
      ) : (
        <ClockifyImport />
      )}
    </div>
  )
}
