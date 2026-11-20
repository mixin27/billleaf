import { useQueryClient } from "@tanstack/react-query"
import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import * as React from "react"
import { Alert } from "react-native"

import { useMe } from "@/features/me"
import { canTrackTime, useRunningTimer } from "@/features/time"
import { useWorkspaces } from "@/features/workspaces"
import { api, errorMessage, unwrap } from "@/lib/api"
import {
  cancelTimerReminder,
  type ReminderData,
  STOP_ACTION,
  syncTimerReminder,
} from "@/lib/timer-reminder"
import {
  useReminderSettings,
  useReminderSettingsHydrated,
} from "@/stores/reminder-settings"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * Keeps the "still running?" reminder in step with the running timer
 * (wherever it was started), and handles a tap on it: open the Time tab,
 * or stop the timer first with "Stop timer".
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

  useReminderResponse()
}

function useReminderResponse() {
  const qc = useQueryClient()
  const workspaces = useWorkspaces()
  const response = Notifications.useLastNotificationResponse()
  const handled = React.useRef<string | null>(null)

  React.useEffect(() => {
    const data = response?.notification.request.content.data as
      Partial<ReminderData> | undefined
    if (!response || !data?.entryId || !data.workspace) return
    // Wait for the membership list before switching workspace.
    if (!workspaces.data) return
    const key = `${response.notification.date}:${response.actionIdentifier}`
    if (handled.current === key) return
    handled.current = key
    Notifications.clearLastNotificationResponse()

    const { entryId } = data
    const target = workspaces.data.find((w) => w.id === data.workspace!.id)
    if (!target) return // You've left that workspace since.
    const store = useWorkspaceStore.getState()
    if (store.workspace?.id !== target.id) store.setWorkspace(target)

    const open = () => router.navigate("/time")
    if (response.actionIdentifier !== STOP_ACTION) return open()

    void (async () => {
      try {
        // Only the timer the reminder was about (not one started since).
        const { entry } = await unwrap(api.GET("/v1/time-entries/running"))
        if (entry?.id === entryId)
          await unwrap(api.POST("/v1/time-entries/stop"))
        else Alert.alert("Timer already stopped", "Nothing is running now.")
      } catch (e) {
        Alert.alert("Couldn't stop the timer", errorMessage(e))
      }
      await Promise.all(
        ["time", "dashboard", "invoices"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] })
        )
      )
      open()
    })()
  }, [response, workspaces.data, qc])
}
