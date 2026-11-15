"use client"

import { useWorkspaceProfile } from "@/features/workspace"

import { TimerBar } from "./timer-bar"
import { TrackerList } from "./tracker-list"

/** The Time page's tracker: timer bar on top, entries below. */
export function Tracker() {
  const profile = useWorkspaceProfile()
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.data?.timezone ?? "UTC",
  }).format(new Date())
  return (
    <div className="flex flex-col gap-6">
      <TimerBar today={today} />
      <TrackerList today={today} />
    </div>
  )
}
