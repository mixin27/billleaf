import * as React from "react"
import { StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"

import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { errorKind, errorMessage, isRetryable } from "@/lib/api"
import type { ErrorKind } from "@/lib/api-error"

import { Button } from "./controls"
import { IconTile } from "./list"
import { Icon, type IconName, Text } from "./text"

/**
 * What a list shows before it has anything: what it is for, in one
 * sentence, and the way to add the first one. With filters on, say so and
 * offer to clear them.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName
  title: string
  body?: string
  action?: { label: string; onPress: () => void; icon?: IconName }
}) {
  const t = useTheme()
  return (
    <View style={[styles.box, { borderColor: t.borderStrong }]}>
      <IconTile icon={icon} tone="primary" size={48} />
      <Text variant="headline" style={styles.center}>
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="muted" style={styles.center}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button
          title={action.label}
          icon={action.icon}
          size="sm"
          fullWidth={false}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  )
}

const TITLES: Partial<Record<ErrorKind, string>> = {
  offline: "You're offline",
  unreachable: "Can't reach Billleaf",
  timeout: "Taking too long",
  server: "Billleaf had a problem",
  forbidden: "Not for your role",
  notFound: "Not found",
  session: "Signed out",
}

/**
 * A failed load: what happened in plain words, and Try again when trying
 * again can help (not for a permission or a missing item). `compact` fits
 * inside a card or a list.
 */
export function ErrorState({
  error,
  onRetry,
  compact,
}: {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}) {
  const t = useTheme()
  const kind = errorKind(error)
  const icon: IconName =
    kind === "offline"
      ? "offline"
      : kind === "unreachable" || kind === "timeout" || kind === "server"
        ? "cloudOff"
        : "alert"
  const retry =
    onRetry && isRetryable(error) ? (
      <Button
        title="Try again"
        icon="refresh"
        variant="secondary"
        size="sm"
        fullWidth={false}
        onPress={onRetry}
      />
    ) : null
  if (compact)
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.compact,
          { backgroundColor: t.surface, borderColor: t.border },
        ]}
      >
        <View style={styles.compactRow}>
          <Icon
            name={icon}
            size={20}
            tone={kind === "offline" ? "muted" : "out"}
          />
          <Text variant="callout" tone="muted" style={styles.flex}>
            {errorMessage(error)}
          </Text>
        </View>
        {retry}
      </View>
    )
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { borderColor: t.borderStrong }]}
    >
      <IconTile
        icon={icon}
        tone={kind === "offline" ? "neutral" : "out"}
        size={48}
      />
      <Text variant="headline" style={styles.center}>
        {TITLES[kind] ?? "Couldn't load this"}
      </Text>
      <Text variant="callout" tone="muted" style={styles.center}>
        {errorMessage(error)}
      </Text>
      {retry}
    </View>
  )
}

/** A grey placeholder that shimmers (still when motion is reduced). */
export function Skeleton({
  width,
  height = 14,
  radius = Radius.sm,
}: {
  width: number | `${number}%`
  height?: number
  radius?: number
}) {
  const t = useTheme()
  const reduced = useReducedMotion()
  const o = useSharedValue(1)
  React.useEffect(() => {
    if (!reduced)
      o.value = withRepeat(withTiming(0.45, { duration: 700 }), -1, true)
  }, [reduced, o])
  const style = useAnimatedStyle(() => ({ opacity: o.value }))
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: t.surfaceMuted,
        },
        style,
      ]}
    />
  )
}

/** Placeholder rows while a list loads. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  const t = useTheme()
  return (
    <View
      accessibilityLabel="Loading"
      style={[
        styles.rows,
        { backgroundColor: t.surface, borderColor: t.border },
      ]}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={36} height={36} radius={9} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={10} />
          </View>
          <Skeleton width={64} height={14} />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    gap: Space[3],
    paddingHorizontal: Space[6],
    paddingVertical: Space[8],
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: Radius.lg,
  },
  compact: {
    gap: Space[3],
    alignItems: "flex-start",
    padding: Space[4],
    borderWidth: 1,
    borderRadius: Radius.lg - 2,
  },
  compactRow: { flexDirection: "row", gap: Space[3], alignItems: "flex-start" },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  rows: { borderWidth: 1, borderRadius: Radius.lg - 2, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[3],
    padding: Space[4] - 2,
    minHeight: 60,
  },
})
