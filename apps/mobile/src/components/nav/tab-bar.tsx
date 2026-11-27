import type { BottomTabBarProps } from "expo-router/js-tabs"
import { router } from "expo-router"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import Svg, { Circle } from "react-native-svg"

import { Icon, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useMe } from "@/features/me"
import { useTimerControls } from "@/features/timer-controls"
import { useBreakpoint } from "@/hooks/use-breakpoint"
import { useTheme } from "@/hooks/use-theme"
import { formatClock } from "@/lib/clock"
import { haptic } from "@/lib/haptics"
import { activeSlot, type NavSlot, navSlotsFor } from "@/lib/nav"
import { useChrome } from "@/stores/chrome-store"

/** Height of the bar's row (without the safe-area inset). */
export const TAB_BAR_HEIGHT = 64
/** Width of the tablet rail. */
export const RAIL_WIDTH = 88
const DOCK = 60
/** How far the dock rises above the bar (the mini-player clears it). */
export const DOCK_RISE = DOCK / 2 - 4

/**
 * The app's navigation: a bottom bar on phones (Home · Money · [timer] ·
 * Time · More) and a side rail on tablets, with the timer dock in the
 * middle of the bar or at the top of the rail. What shows comes from
 * `navSlotsFor` (src/lib/nav.ts).
 */
export function TabBar({
  state,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const t = useTheme()
  const me = useMe()
  const bp = useBreakpoint()
  const slots = navSlotsFor(me.data)
  const focused = state.routes[state.index]?.name ?? "index"
  const rail = bp !== "compact"
  const list = rail ? slots.rail : slots.bar
  const active = activeSlot(list, focused)

  const go = (slot: NavSlot) => {
    const route = state.routes.find((r) => r.name === slot.route)
    if (!route) return
    haptic.selection()
    const event = emitter.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    })
    if (route.name !== focused && !event.defaultPrevented)
      navigateToTab(route.key)
  }

  const items = list.map((s) => (
    <TabItem
      key={s.route}
      slot={s}
      active={active === s.route}
      onPress={() => go(s)}
      rail={rail}
    />
  ))

  if (rail)
    return (
      <View
        style={[
          styles.rail,
          {
            backgroundColor: t.surface,
            borderRightColor: t.border,
            paddingTop: insets.top + Space[4],
            paddingBottom: insets.bottom + Space[4],
            paddingLeft: insets.left,
          },
        ]}
      >
        {slots.timer ? (
          <View style={styles.railDock}>
            <TimerDock />
          </View>
        ) : null}
        {items}
      </View>
    )

  // The dock takes the middle place.
  const mid = Math.ceil(items.length / 2)
  return (
    <View
      onLayout={(e) =>
        useChrome.getState().setTabBar(Math.round(e.nativeEvent.layout.height))
      }
      style={[
        styles.bar,
        {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {slots.timer ? (
        <>
          {items.slice(0, mid)}
          <View style={styles.dockSlot}>
            <View style={styles.dockLift}>
              <TimerDock />
            </View>
          </View>
          {items.slice(mid)}
        </>
      ) : (
        items
      )}
    </View>
  )
}

function TabItem({
  slot,
  active,
  onPress,
  rail,
}: {
  slot: NavSlot
  active: boolean
  onPress: () => void
  rail: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={slot.label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={rail ? styles.railItem : styles.item}
    >
      {({ pressed }) => (
        <>
          <View style={styles.pill}>
            {/* Mounted only when shown: Android loses the radius when a
                rounded view's background colour changes in place. */}
            {active || pressed ? (
              <View
                style={[
                  styles.pillFill,
                  { backgroundColor: active ? t.primarySoft : t.pressed },
                ]}
              />
            ) : null}
            <Icon
              name={slot.icon}
              size={22}
              color={active ? t.inText : t.textMuted}
              strokeWidth={active ? 2 : 1.8}
            />
          </View>
          <Text
            variant="caption"
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{
              color: active ? t.inText : t.textMuted,
              fontWeight: active ? "600" : "500",
            }}
          >
            {slot.label}
          </Text>
        </>
      )}
    </Pressable>
  )
}

/**
 * The raised round timer button. Idle: tap opens the timer, long-press
 * starts a blank one at once. Running: a ring fills with each minute and
 * the time shows inside; tap opens the timer.
 */
export function TimerDock() {
  const t = useTheme()
  const timer = useTimerControls()
  const running = Boolean(timer.entry)
  const label = running
    ? `Timer running, ${formatClock(timer.elapsed)}. Open the timer`
    : "Timer. Open the timer"
  const open = () => {
    haptic.press()
    router.push("/timer")
  }
  return (
    <View style={styles.dockWrap}>
      {running ? <Pulse /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          running ? undefined : "Long-press to start a blank timer"
        }
        accessibilityActions={
          running
            ? undefined
            : [{ name: "longpress", label: "Start a blank timer" }]
        }
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "longpress") timer.startBlank()
        }}
        onPress={open}
        onLongPress={running || timer.starting ? open : timer.startBlank}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.dock,
          {
            backgroundColor: pressed ? t.primaryPressed : t.primary,
            borderColor: t.surface,
            shadowColor: t.shadow,
          },
        ]}
      >
        {running ? (
          <>
            <Ring progress={(timer.elapsed % 60) / 60} color={t.onPrimary} />
            <Text
              variant="caption"
              numeric
              maxFontSizeMultiplier={1}
              style={{ color: t.onPrimary, fontWeight: "700", fontSize: 11 }}
            >
              {shortClock(timer.elapsed)}
            </Text>
          </>
        ) : (
          <Icon name="play" size={26} color={t.onPrimary} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  )
}

/** 1:24 under an hour is 0:01:24 → "1:24"; "1:05:09" above. */
function shortClock(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}` : `${m}:${pad(sec)}`
}

function Ring({ progress, color }: { progress: number; color: string }) {
  const size = DOCK - 6
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeOpacity={0.25}
        strokeWidth={2.5}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - progress)}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  )
}

/** The running timer's soft halo: the app's only looping motion. */
function Pulse() {
  const t = useTheme()
  const reduced = useReducedMotion()
  const p = useSharedValue(0)
  React.useEffect(() => {
    if (reduced) return
    p.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false)
    return () => cancelAnimation(p)
  }, [reduced, p])
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 0.35 }],
  }))
  if (reduced) return null
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulse, { backgroundColor: t.primary }, style]}
    />
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  pill: {
    width: 56,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  pillFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 15,
  },
  dockSlot: { width: DOCK + Space[4], alignItems: "center" },
  dockLift: { marginTop: -DOCK_RISE },
  dockWrap: {
    width: DOCK,
    height: DOCK,
    alignItems: "center",
    justifyContent: "center",
  },
  dock: {
    width: DOCK,
    height: DOCK,
    borderRadius: DOCK / 2,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pulse: {
    position: "absolute",
    width: DOCK,
    height: DOCK,
    borderRadius: DOCK / 2,
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: "center",
    gap: Space[3],
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  railDock: { marginBottom: Space[4] },
  railItem: {
    width: RAIL_WIDTH,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
})
