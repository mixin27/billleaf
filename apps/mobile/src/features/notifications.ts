import { type NotificationSettings, type PushType } from "@workspace/contracts"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import * as Notifications from "expo-notifications"
import { router } from "expo-router"
import * as React from "react"
import { Alert, AppState } from "react-native"

import { useWorkspaces } from "@/features/workspaces"
import { api, errorMessage, unwrap } from "@/lib/api"
import { isPushData, onPushTokenChange, registerForPush } from "@/lib/push"
import { type ReminderData, STOP_ACTION } from "@/lib/timer-reminder"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Yours, not the workspace's: the same on every phone and workspace. */
const settingsKey = ["notification-settings"] as const

export function useNotificationSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => unwrap(api.GET("/v1/me/notification-settings")),
  })
}

/** Flips one type at once; puts it back if the API says no. */
export function useSetNotificationSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { type: PushType; enabled: boolean }) =>
      unwrap(api.PUT("/v1/me/notification-settings", { body })),
    onMutate: async ({ type, enabled }) => {
      await qc.cancelQueries({ queryKey: settingsKey })
      const before = qc.getQueryData<NotificationSettings>(settingsKey)
      if (before)
        qc.setQueryData<NotificationSettings>(settingsKey, {
          items: before.items.map((i) =>
            i.type === type ? { ...i, enabled } : i
          ),
        })
      return { before }
    },
    onError: (e, _v, c) => {
      if (c?.before) qc.setQueryData(settingsKey, c.before)
      Alert.alert("Couldn't change the setting", errorMessage(e))
    },
    onSuccess: (data) => qc.setQueryData(settingsKey, data),
  })
}

/**
 * Signed in: give Billleaf this phone's push token if notifications are
 * already allowed (asking is the Account screen's job), again when you
 * come back to the app (you may have allowed them in Settings), and
 * whenever the OS rotates the token.
 */
export function usePushRegistration() {
  React.useEffect(() => {
    const quietly = () => void registerForPush().catch(() => {})
    quietly()
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") quietly()
    })
    const token = onPushTokenChange()
    return () => {
      app.remove()
      token()
    }
  }, [])
}

/** What each push changes, so lists on screen catch up. */
const REFRESH: Record<PushType, string[]> = {
  "quote.answered": ["quotes", "dashboard"],
  "contract.signed": ["contracts"],
  "payment.received": ["invoices", "payments", "dashboard", "clients"],
  "timesheet.submitted": ["time"],
}

function refresh(qc: QueryClient, type: PushType) {
  return Promise.all(
    (REFRESH[type] ?? []).map((k) => qc.invalidateQueries({ queryKey: [k] }))
  )
}

/** A push that arrives while the app is open refreshes what it's about. */
export function useForegroundPushRefresh() {
  const qc = useQueryClient()
  React.useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data
      if (isPushData(data)) void refresh(qc, data.type)
    })
    return () => sub.remove()
  }, [qc])
}

/**
 * A tap on a notification: a push opens what it's about, the timer
 * reminder opens the Time tab (or stops the timer with "Stop timer").
 * Both switch to the workspace they belong to first. Mounted with or
 * without an active workspace: the screen opens once the switch is in.
 */
export function useNotificationResponse() {
  const qc = useQueryClient()
  const workspaces = useWorkspaces()
  const active = useWorkspaceStore((s) => s.workspace?.id)
  const response = Notifications.useLastNotificationResponse()
  const handled = React.useRef<string | null>(null)
  const [pending, setPending] = React.useState<{
    workspaceId: string
    path: string
  } | null>(null)

  // Open the screen once the right workspace is active (the screens are
  // only there with one).
  React.useEffect(() => {
    if (!pending || active !== pending.workspaceId) return
    setPending(null)
    if (pending.path === "/time" || pending.path === "/")
      router.navigate(pending.path)
    else router.push(pending.path as never)
  }, [pending, active])

  React.useEffect(() => {
    const data = response?.notification.request.content.data as
      (Partial<ReminderData> & Record<string, unknown>) | undefined
    if (!response || !data?.workspace) return
    // Wait for the membership list before switching workspace.
    if (!workspaces.data) return
    const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`
    if (handled.current === key) return
    handled.current = key
    Notifications.clearLastNotificationResponse()

    const target = workspaces.data.find((w) => w.id === data.workspace!.id)
    if (!target) return // You've left that workspace since.
    const store = useWorkspaceStore.getState()
    if (store.workspace?.id !== target.id) store.setWorkspace(target)
    const open = (path: string) => setPending({ workspaceId: target.id, path })

    if (isPushData(data)) {
      void refresh(qc, data.type)
      return open(data.path ?? "/")
    }

    const { entryId } = data
    if (!entryId) return
    if (response.actionIdentifier !== STOP_ACTION) return open("/time")

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
      open("/time")
    })()
  }, [response, workspaces.data, qc])
}
