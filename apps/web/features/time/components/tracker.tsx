"use client"

import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile } from "@/features/workspace"

import { ClockifyImport } from "./clockify-import"
import { useShortcut } from "@/lib/shortcuts"

import { useTimesheetApprovals } from "../api/approvals"
import { useTimeFavorites } from "../api/favorites"
import { zonedParts } from "../zoned"
import { CalendarEntryDialog, type Slot } from "./calendar-entry-dialog"
import { TimeCalendar } from "./time-calendar"
import { TimeReports } from "./time-reports"
import { FavoritesBar, useStartFavoriteAction } from "./favorites-bar"
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
  const canTrack = can("time.track") || can("time.manage")
  const tz = profile.data?.timezone ?? "UTC"
  const favorites = useTimeFavorites(canTrack)
  const { start: startFavorite } = useStartFavoriteAction()
  const [logSlot, setLogSlot] = React.useState<Slot | null>(null)
  // 1–9 start a favourite; N logs time (the hour up to now).
  useShortcut(
    ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    (e) => {
      const f = favorites.data?.[Number(e.key) - 1]
      if (f) startFavorite(f)
    },
    canTrack
  )
  useShortcut(
    "n",
    () => {
      const now = zonedParts(new Date(), tz)
      const end = Math.max(60, Math.floor(now.minutes / 15) * 15)
      setLogSlot({ date: now.date, start: end - 60, end })
    },
    canTrack
  )
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
          <FavoritesBar />
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
      <CalendarEntryDialog
        open={logSlot !== null}
        onOpenChange={(o) => !o && setLogSlot(null)}
        slot={logSlot}
        tz={tz}
      />
    </div>
  )
}
