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
import { errorMessage } from "@/lib/api"

import { Button } from "./controls"
import { IconTile } from "./list"
import { type IconName, Text } from "./text"

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

/** A failed load: what happened and a Retry that calls `onRetry`. */
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
  return (
    <View
      style={[
        compact ? styles.compact : styles.box,
        { borderColor: t.outSoft },
      ]}
    >
      {compact ? null : <IconTile icon="alert" tone="out" size={48} />}
      <Text
        variant="callout"
        tone="muted"
        style={compact ? undefined : styles.center}
      >
        {errorMessage(error)}
      </Text>
      {onRetry ? (
        <Button
          title="Try again"
          icon="refresh"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={onRetry}
        />
      ) : null}
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
  compact: { gap: Space[2], alignItems: "flex-start" },
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
