import { type NativeStackNavigationOptions, Stack } from "expo-router"
import * as React from "react"
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native"

import { MiniPlayer } from "@/components/nav/mini-player"
import { EmptyState } from "@/components/ui"
import { Space } from "@/constants/theme"

import {
  useForegroundPushRefresh,
  useNotificationResponse,
  usePushRegistration,
} from "@/features/notifications"
import { useSessionExpiry } from "@/features/session-expiry"
import { useTimerReminder } from "@/features/timer-reminder"
import { useWorkspaces } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Mounted only with an active workspace (the reminder belongs to one). */
function TimerReminder() {
  useTimerReminder()
  return null
}

function useHydrated() {
  const [done, setDone] = React.useState(() =>
    useWorkspaceStore.persist.hasHydrated()
  )
  React.useEffect(
    () => useWorkspaceStore.persist.onFinishHydration(() => setDone(true)),
    []
  )
  return done
}

/**
 * Signed in. The dashboard needs an active workspace; without one you land
 * on the picker. The remembered workspace is checked against your current
 * memberships (you may have left it), and a single workspace is picked for you.
 */
/** Signs out here when the API says the session ended. */
function SessionWatch() {
  useSessionExpiry()
  return null
}

/** Pushes for whoever is signed in, with or without a workspace open. */
function PushNotifications() {
  usePushRegistration()
  useForegroundPushRefresh()
  useNotificationResponse()
  return null
}

function sheetOptions(): NativeStackNavigationOptions {
  return Platform.OS === "ios"
    ? { presentation: "modal" }
    : {
        presentation: "formSheet",
        sheetAllowedDetents: [1],
        sheetCornerRadius: 16,
        sheetGrabberVisible: true,
      }
}

export default function AppLayout() {
  const t = useTheme()
  const hydrated = useHydrated()
  const workspaces = useWorkspaces()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const list = workspaces.data
  // Wait only for the first answer. After that a refetch (which puts a
  // query with no data back to "pending") mustn't swap the screens out, or
  // the workspaces screen remounts, refetches and loops.
  const [settled, setSettled] = React.useState(false)
  if (!settled && (workspaces.data || workspaces.error)) setSettled(true)

  React.useEffect(() => {
    if (!hydrated || !list) return
    const current = workspace && list.find((w) => w.id === workspace.id)
    if (current) {
      if (current.name !== workspace.name || current.slug !== workspace.slug)
        setWorkspace(current)
    } else if (list.length === 1) setWorkspace(list[0]!)
    else if (workspace) setWorkspace(null)
  }, [hydrated, list, workspace, setWorkspace])

  // Forms and pickers open as sheets: iOS's page sheet (swipe down to
  // close) and a full-height bottom sheet on Android. Back closes them.
  const sheet = sheetOptions()

  // Pushed screens (an invoice, a client) get a native header.
  const pushed = {
    headerShown: true,
    headerTintColor: t.primary,
    headerStyle: { backgroundColor: t.background },
    headerTitleStyle: { color: t.text },
    headerShadowVisible: false,
  }

  // Wait for the stored choice (and, without one, the list) before routing.
  if (!hydrated) return null
  if (!workspace && !settled)
    return (
      <View style={[styles.wait, { backgroundColor: t.canvas }]}>
        {workspaces.fetchStatus === "paused" ? (
          <EmptyState
            icon="offline"
            title="You're offline"
            body="Your workspaces load as soon as you're back online."
          />
        ) : (
          <ActivityIndicator color={t.primary} accessibilityLabel="Loading" />
        )}
      </View>
    )

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <SessionWatch />
      <PushNotifications />
      {workspace ? <TimerReminder /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={Boolean(workspace)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="timer"
            options={{
              // Slides up like a music app's player; swipe down (iOS) or
              // Back collapses it into the mini-player.
              presentation: Platform.OS === "ios" ? "modal" : "card",
              animation: "slide_from_bottom",
              gestureEnabled: true,
            }}
          />
          <Stack.Screen name="project-picker" options={sheet} />
          <Stack.Screen name="expense-new" options={sheet} />
          <Stack.Screen name="entry-edit" options={sheet} />
          <Stack.Screen name="payment-new" options={sheet} />
          <Stack.Screen name="send" options={sheet} />
          <Stack.Screen name="contract-step" options={sheet} />
          <Stack.Screen name="payment-void" options={sheet} />
          <Stack.Screen name="book-new" options={sheet} />
          <Stack.Screen name="book-filters" options={sheet} />
          <Stack.Screen name="cashbook-entry-edit" options={sheet} />
          <Stack.Screen name="cashbook-transfer" options={sheet} />
          <Stack.Screen
            name="book/[id]"
            options={{ ...pushed, title: "Cashbook", headerBackTitle: "Back" }}
          />
          <Stack.Screen name="cashbook-entry" options={sheet} />
          <Stack.Screen
            name="book-settings"
            options={{
              ...pushed,
              title: "Book settings",
              headerBackTitle: "Back",
            }}
          />
          <Stack.Screen
            name="book-members"
            options={{ ...pushed, title: "Members", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="book-report"
            options={{ ...pushed, title: "Reports", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="invoice/[id]"
            options={{ ...pushed, title: "Invoice", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="quote/[id]"
            options={{ ...pushed, title: "Quote", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="contract/[id]"
            options={{ ...pushed, title: "Contract", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="client/[id]"
            options={{ ...pushed, title: "Client", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="sales"
            options={{ ...pushed, title: "Invoices", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="work"
            options={{ ...pushed, title: "Clients", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="approvals"
            options={{ ...pushed, title: "Approvals", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="approval/[id]"
            options={{ ...pushed, title: "Timesheet", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="account"
            options={{ ...pushed, title: "Account", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="project/[id]"
            options={{ ...pushed, title: "Project", headerBackTitle: "Back" }}
          />
        </Stack.Protected>
        <Stack.Screen
          name="workspaces"
          options={{ presentation: workspace ? "modal" : "card" }}
        />
      </Stack>
      {workspace ? <MiniPlayer /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wait: { flex: 1, justifyContent: "center", padding: Space[6] },
})
