import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { useWorkspaceStore } from "@/stores/workspace-store"

import { Icon, Text } from "./text"

/**
 * The top of a tab: the workspace you're in (tap to switch), the tab's
 * title and its actions. Covers the status bar inset itself.
 */
export function AppBar({
  title,
  subtitle,
  trailing,
}: {
  title: string
  /** A line under the title (Home's date). */
  subtitle?: string
  trailing?: React.ReactNode
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const workspace = useWorkspaceStore((s) => s.workspace)
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top + Space[2], backgroundColor: t.canvas },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Workspace ${workspace?.name ?? ""}. Switch workspace`}
          onPress={() => router.push("/workspaces")}
          hitSlop={6}
          style={({ pressed }) => [
            styles.workspace,
            {
              backgroundColor: pressed ? t.pressed : t.surface,
              borderColor: t.border,
            },
          ]}
        >
          <Icon name="building" size={16} tone="muted" />
          <Text variant="label" numberOfLines={1} style={styles.name}>
            {workspace?.name}
          </Text>
          <Icon name="chevronDown" size={16} tone="muted" />
        </Pressable>
        <View style={styles.actions}>{trailing}</View>
      </View>
      <View>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Space[4],
    paddingBottom: Space[3],
    gap: Space[3],
  },
  row: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  workspace: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    maxWidth: "75%",
    height: 36,
    paddingHorizontal: Space[3],
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { flexShrink: 1 },
  actions: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Space[1],
  },
})
