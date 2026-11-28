import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Radius, Space } from "@/constants/theme"
import { useRegisterBottomBar } from "@/hooks/use-register-bottom-bar"
import { useTheme } from "@/hooks/use-theme"
import { haptic } from "@/lib/haptics"

import { IconButton } from "./controls"
import { Icon, type IconName, Text } from "./text"

/**
 * The screen's main action(s), pinned to the bottom above the home
 * indicator: Cash in / Cash out, Submit week, Approve. Put it after the
 * scroll view; give the scroll content `paddingBottom` of its height
 * (plus `useMiniPlayerInset()`: the timer's mini-player floats above it).
 */
export function BottomActionBar({
  children,
  insetBottom = true,
}: {
  children: React.ReactNode
  /** False when something below it (the tab bar) already covers the inset. */
  insetBottom?: boolean
}) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  // The mini-player floats above this bar while the screen is on top.
  const onLayout = useRegisterBottomBar()
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.bar,
        {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: Space[3] + (insetBottom ? insets.bottom : 0),
        },
      ]}
    >
      {flatten(children).map((c, i) => (
        <View key={i} style={{ flex: 1 }}>
          {c}
        </View>
      ))}
    </View>
  )
}

/** Children as a flat list: a fragment's items each get their own slot. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((c) =>
    React.isValidElement<{ children?: React.ReactNode }>(c) &&
    c.type === React.Fragment
      ? flatten(c.props.children)
      : c
        ? [c]
        : []
  )
}

/** Height of a BottomActionBar's content (without the safe-area inset). */
export const BOTTOM_BAR_HEIGHT = 48 + Space[3] * 2

/**
 * The floating "+ Add …" button on lists, bottom right. `bottom` is its
 * distance from the bottom of the screen area it floats in.
 */
export function Fab({
  label,
  icon = "plus",
  onPress,
  bottom = Space[4],
}: {
  label: string
  icon?: IconName
  onPress: () => void
  bottom?: number
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.press()
        onPress()
      }}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom,
          backgroundColor: pressed ? t.primaryPressed : t.primary,
          shadowColor: t.shadow,
        },
      ]}
    >
      <Icon name={icon} size={22} color={t.onPrimary} />
      <Text
        variant="label"
        numberOfLines={1}
        style={{ color: t.onPrimary, fontWeight: "600", flexShrink: 0 }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** The top of every sheet: a grabber, the title and a close button. */
export function SheetHeader({
  title,
  onClose,
  trailing,
}: {
  title: string
  onClose: () => void
  trailing?: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={styles.sheetHead}>
      <View style={[styles.grab, { backgroundColor: t.borderStrong }]} />
      <View style={styles.sheetRow}>
        <Text
          variant="headline"
          accessibilityRole="header"
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {trailing}
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
    </View>
  )
}

/** The bottom of a sheet: its actions, above the keyboard and home bar. */
export function SheetFooter({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: Space[3] + insets.bottom,
        },
      ]}
    >
      {flatten(children).map((c, i) => (
        <View key={i} style={{ flex: 1 }}>
          {c}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: Space[3],
    paddingHorizontal: Space[4],
    paddingTop: Space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fab: {
    position: "absolute",
    right: Space[4],
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    height: 52,
    paddingLeft: Space[3] + 2,
    paddingRight: Space[5],
    borderRadius: Radius.xl,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sheetHead: { paddingTop: Space[2] },
  grab: { width: 36, height: 4, borderRadius: 2, alignSelf: "center" },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Space[4],
    paddingRight: Space[1],
    paddingTop: Space[1],
  },
})
