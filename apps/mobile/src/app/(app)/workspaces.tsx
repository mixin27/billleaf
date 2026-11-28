import { router } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import * as React from "react"
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Screen,
  Title,
  ErrorState,
  RefreshControl,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useWorkspaces } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { WEB_URL } from "@/lib/config"
import { signOut } from "@/lib/session"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Pick the workspace to work in (also how you switch). */
export default function WorkspacesScreen() {
  const t = useTheme()
  const workspaces = useWorkspaces()
  const active = useWorkspaceStore((s) => s.workspace)
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace)
  const [signingOut, setSigningOut] = React.useState(false)

  const footer = (
    <View style={styles.footer}>
      <Button
        title="Create a workspace on the web"
        variant="link"
        onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/onboarding`)}
      />
      {active ? null : (
        <Button
          title="Sign out"
          variant="secondary"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true)
            await signOut()
          }}
        />
      )}
    </View>
  )

  return (
    <Screen>
      <SafeAreaView style={styles.content} edges={["top", "bottom"]}>
        <Title>Workspaces</Title>
        {workspaces.isPending ? (
          <ActivityIndicator style={styles.loading} />
        ) : workspaces.error && !workspaces.data ? (
          <View style={styles.empty}>
            <ErrorState
              compact
              error={workspaces.error}
              onRetry={() => void workspaces.refetch()}
            />
            {footer}
          </View>
        ) : (
          <FlatList
            data={workspaces.data}
            keyExtractor={(w) => w.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={workspaces.isRefetching}
                onRefresh={() => {
                  void workspaces.refetch()
                }}
              />
            }
            ListEmptyComponent={
              <Body muted>
                You&apos;re not in a workspace yet. Create one on the web, or
                ask a teammate to invite you.
              </Body>
            }
            renderItem={({ item }) => {
              const selected = item.id === active?.id
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setWorkspace(item)
                    if (router.canGoBack()) router.back()
                    else router.replace("/")
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: selected
                        ? t.backgroundSelected
                        : t.backgroundElement,
                      borderColor: selected ? t.primary : t.border,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: t.primary }]}>
                    <Text
                      style={[
                        Type.body,
                        styles.initial,
                        { color: t.onPrimary },
                      ]}
                    >
                      {item.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[Type.body, styles.name, { color: t.text }]}>
                      {item.name}
                    </Text>
                    <Text style={[Type.small, { color: t.textSecondary }]}>
                      {item.slug}
                    </Text>
                  </View>
                  {selected ? (
                    <Text style={[Type.small, { color: t.primary }]}>
                      Current
                    </Text>
                  ) : null}
                </Pressable>
              )
            }}
            ListFooterComponent={footer}
          />
        )}
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingTop: Spacing.four,
  },
  loading: { marginTop: Spacing.five },
  empty: { gap: Spacing.three },
  list: { gap: Spacing.two, paddingBottom: Spacing.four },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontWeight: "700" },
  rowText: { flex: 1, gap: Spacing.half },
  name: { fontWeight: "600" },
  footer: { gap: Spacing.two, marginTop: Spacing.three },
})
