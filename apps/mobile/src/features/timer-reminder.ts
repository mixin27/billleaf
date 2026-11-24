import * as React from "react"

import { useMe } from "@/features/me"
import { canTrackTime, useRunningTimer } from "@/features/time"
import { cancelTimerReminder, syncTimerReminder } from "@/lib/timer-reminder"
import {
  useReminderSettings,
  useReminderSettingsHydrated,
} from "@/stores/reminder-settings"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * Keeps the "still running?" reminder in step with the running timer
 * (wherever it was started). A tap on it is handled with the other
 * notifications, in `features/notifications.ts`.
 */
export function useTimerReminder() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const me = useMe()
  const canTrack = canTrackTime(me.data)
  const running = useRunningTimer(canTrack)
  const hours = useReminderSettings((s) => s.hours)
  const hydrated = useReminderSettingsHydrated()

  React.useEffect(() => {
    if (!workspace || !me.data || !hydrated) return
    if (!canTrack) {
      void cancelTimerReminder()
      return
    }
    if (running.data === undefined) return
    syncTimerReminder(running.data, workspace, hours).catch(() => {})
  }, [workspace, me.data, canTrack, running.data, hours, hydrated])
}
