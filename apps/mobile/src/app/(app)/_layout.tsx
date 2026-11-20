import { Stack } from "expo-router"
import * as React from "react"

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
export default function AppLayout() {
  const t = useTheme()
  const hydrated = useHydrated()
  const workspaces = useWorkspaces()
  const workspace = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const list = workspaces.data

  React.useEffect(() => {
    if (!hydrated || !list) return
    const current = workspace && list.find((w) => w.id === workspace.id)
    if (current) {
      if (current.name !== workspace.name || current.slug !== workspace.slug)
        setWorkspace(current)
    } else if (list.length === 1) setWorkspace(list[0]!)
    else if (workspace) setWorkspace(null)
  }, [hydrated, list, workspace, setWorkspace])

  // Pushed screens (an invoice, a client) get a native header.
  const pushed = {
    headerShown: true,
    headerTintColor: t.primary,
    headerStyle: { backgroundColor: t.background },
    headerTitleStyle: { color: t.text },
    headerShadowVisible: false,
  }

  // Wait for the stored choice (and, without one, the list) before routing.
  if (!hydrated || (!workspace && workspaces.isPending)) return null

  return (
    <>
      {workspace ? <TimerReminder /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={Boolean(workspace)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="project-picker"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen
            name="expense-new"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="entry-edit" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="payment-new"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="send" options={{ presentation: "modal" }} />
          <Stack.Screen
            name="invoice/[id]"
            options={{ ...pushed, title: "Invoice", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="client/[id]"
            options={{ ...pushed, title: "Client", headerBackTitle: "Back" }}
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
    </>
  )
}
