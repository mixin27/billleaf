import { router, usePathname } from "expo-router"
import { Pressable, StyleSheet, View } from "react-native"
import { GestureDetector, usePanGesture } from "react-native-gesture-handler"
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useTimerControls } from "@/features/timer-controls"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { useTheme } from "@/hooks/use-theme"
import { formatClock } from "@/lib/clock"
import { miniPlayerPlacement } from "@/lib/nav"
import { useChrome } from "@/stores/chrome-store"

import { DOCK_RISE, RAIL_WIDTH } from "./tab-bar"

const HEIGHT = 56
const GAP = Space[2]

/** Where the mini-player is right now (null when it isn't showing). */
function usePlacement() {
  const pathname = usePathname()
  const { entry, enabled } = useTimerControls()
  return miniPlayerPlacement(pathname, enabled && Boolean(entry))
}

/**
 * Extra bottom padding for a list or a screen's own bottom bar, so the
 * mini-player never covers the last row. 0 while it isn't showing.
 */
export function useMiniPlayerInset() {
  const where = usePlacement()
  if (where === "hidden") return 0
  return HEIGHT + GAP * 2 + (where === "tabs" ? DOCK_RISE : 0)
}

/**
 * The running timer, floating above the tab bar (or a screen's own bottom
 * bar) while you use the rest of the app, like a music app's player. Tap or
 * swipe up for the timer screen; Stop is one tap (with Undo). It can't be
 * swiped away: the timer keeps running.
 */
export function MiniPlayer() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const bp = useBreakpoint()
  const timer = useTimerControls()
  const where = usePlacement()
  const tabBar = useChrome((s) => s.tabBar)
  const bottomBar = useChrome((s) => s.bottomBar?.height ?? 0)

  const open = () => router.push("/timer")
  // Swipe up opens the timer too; sideways does nothing (no dismissing).
  const swipeUp = usePanGesture({
    activeOffsetY: -12,
    failOffsetX: [-24, 24],
    runOnJS: true,
    onDeactivate: (e) => {
      if (e.translationY < -24) open()
    },
  })

  if (where === "hidden" || !timer.entry) return null
  const e = timer.entry
  const rail = bp !== "compact"
  const bottom =
    where === "tabs" && !rail
      ? (tabBar || insets.bottom) + DOCK_RISE + GAP
      : bottomBar
        ? bottomBar + GAP
        : insets.bottom + GAP
  const project = [e.projectName, e.taskTitle].filter(Boolean).join(": ")

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom,
          left: (rail && where === "tabs" ? RAIL_WIDTH : 0) + Space[3],
          right: Space[3],
        },
      ]}
    >
      <GestureDetector gesture={swipeUp}>
        <View
          style={[
            styles.player,
            {
              backgroundColor: t.surface,
              borderColor: t.border,
              shadowColor: t.shadow,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Timer running: ${e.description || "No description"}${project ? `, ${project}` : ""}, ${formatClock(timer.elapsed)}`}
            accessibilityHint="Opens the timer"
            onPress={open}
            style={styles.body}
          >
            <View style={[styles.dot, { backgroundColor: t.inFill }]} />
            <View style={styles.text}>
              <Text
                variant="label"
                numberOfLines={1}
                tone={e.description ? "default" : "muted"}
                style={{ fontWeight: "600" }}
              >
                {e.description || "No description"}
              </Text>
              {project ? (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {project}
                </Text>
              ) : null}
            </View>
            <Text variant="bodyStrong" numeric>
              {formatClock(timer.elapsed)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop the timer"
            disabled={timer.stopping}
            onPress={timer.stopTimer}
            hitSlop={6}
            style={({ pressed }) => [
              styles.stop,
              {
                backgroundColor: pressed ? t.outText : t.outFill,
                opacity: timer.stopping ? 0.6 : 1,
              },
            ]}
          >
            <Icon name="stop" size={18} color={t.onOut} strokeWidth={2.2} />
          </Pressable>
        </View>
      </GestureDetector>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", alignItems: "center" },
  player: {
    width: "100%",
    maxWidth: 560,
    height: HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.xl,
    paddingRight: Space[2],
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  body: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: Space[3],
    paddingLeft: Space[4],
    paddingRight: Space[3],
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, minWidth: 0 },
  stop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
})
