import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  initialsOf,
  ListGroup,
  ListItem,
  RefreshControl,
  SheetHeader,
  SkeletonRows,
  Text,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useWorkspaces } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { WEB_URL } from "@/lib/config"
import { signOut } from "@/lib/session"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * Pick the workspace to work in: a sheet when switching, the first screen
 * when none is open yet (with Sign out there).
 */
export default function WorkspacesScreen() {
  const t = useTheme()
  const workspaces = useWorkspaces()
  const active = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const [signingOut, setSigningOut] = React.useState(false)
  // Only a pull shows the spinner, not the refresh when the sheet opens.
  const [refreshing, setRefreshing] = React.useState(false)
  const switching = Boolean(active)

  const pick = (w: { id: string; name: string; slug: string }) => {
    if (w.id !== active?.id) {
      setWorkspace(w)
      toast.success(`Switched to ${w.name}`)
    }
    if (router.canGoBack()) router.back()
    else router.replace("/")
  }

  const body = (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true)
            await workspaces.refetch()
            setRefreshing(false)
          }}
        />
      }
    >
      {switching ? null : (
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Pick a workspace
          </Text>
          <Text variant="callout" tone="muted">
            Each workspace has its own clients, money and time. You can switch
            any time from the top of a tab.
          </Text>
        </View>
      )}

      {workspaces.isPending ? (
        <SkeletonRows rows={2} />
      ) : workspaces.error && !workspaces.data ? (
        <ErrorState
          error={workspaces.error}
          onRetry={() => void workspaces.refetch()}
        />
      ) : workspaces.data?.length === 0 ? (
        <EmptyState
          icon="building"
          title="You're not in a workspace yet"
          body="Create one on the web, or ask a teammate to invite you."
        />
      ) : (
        <ListGroup>
          {(workspaces.data ?? []).map((w) => {
            const selected = w.id === active?.id
            return (
              <ListItem
                key={w.id}
                title={w.name}
                subtitle={w.slug}
                leading={
                  <Avatar
                    label={initialsOf(w.name)}
                    size={40}
                    tone={selected ? "solid" : "primary"}
                  />
                }
                trailing={
                  selected ? (
                    <Icon name="check" size={20} tone="primary" />
                  ) : null
                }
                selected={selected}
                accessibilityLabel={`${w.name}${selected ? ", current workspace" : ""}`}
                onPress={() => pick(w)}
              />
            )
          })}
        </ListGroup>
      )}

      <View style={styles.footer}>
        <Button
          title="Create a workspace on the web"
          icon="external"
          variant="ghost"
          onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/onboarding`)}
        />
        {switching ? null : (
          <Button
            title="Sign out"
            icon="logout"
            variant="secondary"
            loading={signingOut}
            onPress={async () => {
              setSigningOut(true)
              await signOut()
            }}
          />
        )}
      </View>
    </ScrollView>
  )

  return switching ? (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader title="Switch workspace" onClose={() => router.back()} />
      {body}
    </View>
  ) : (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.canvas }]}>
      {body}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  head: { gap: Space[2], paddingTop: Space[4] },
  footer: { gap: Space[2] },
})
