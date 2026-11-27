import * as React from "react"
import {
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"
import Animated, {
  FadeInUp,
  FadeOutUp,
  SlideInDown,
  useReducedMotion,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { create } from "zustand"

import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { haptic } from "@/lib/haptics"

import { Button } from "./controls"
import { Icon, type IconName, Text } from "./text"

// ── Toasts ───────────────────────────────────────────────────────────────

type ToastAction = { label: string; onPress: () => void }
type ToastItem = {
  id: number
  text: string
  kind: "success" | "error" | "info"
  action?: ToastAction
}

const useToasts = create<{ current: ToastItem | null }>(() => ({
  current: null,
}))
let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null

function show(kind: ToastItem["kind"], text: string, action?: ToastAction) {
  const item = { id: nextId++, text, kind, action }
  if (kind === "success") haptic.success()
  useToasts.setState({ current: item })
  if (timer) clearTimeout(timer)
  timer = setTimeout(
    () => {
      if (useToasts.getState().current?.id === item.id)
        useToasts.setState({ current: null })
    },
    action ? 5000 : 3200
  )
}

/**
 * Results, not questions: "Entry added", "Timer stopped · Undo". Slides in
 * at the top for a few seconds. Questions use `confirm`.
 */
export const toast = {
  success: (text: string, action?: ToastAction) =>
    show("success", text, action),
  error: (text: string, action?: ToastAction) => show("error", text, action),
  info: (text: string, action?: ToastAction) => show("info", text, action),
  dismiss: () => useToasts.setState({ current: null }),
}

function ToastHost() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const current = useToasts((s) => s.current)
  if (!current) return null
  const icon: IconName =
    current.kind === "error"
      ? "alert"
      : current.kind === "success"
        ? "checkCircle"
        : "info"
  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(150)}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toast,
        {
          top: insets.top + Space[2],
          backgroundColor: t.text,
          shadowColor: t.shadow,
        },
      ]}
    >
      <Icon
        name={icon}
        size={20}
        color={current.kind === "error" ? t.outFill : t.surface}
      />
      <Text variant="label" style={{ color: t.surface, flex: 1 }}>
        {current.text}
      </Text>
      {current.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            current.action!.onPress()
            toast.dismiss()
          }}
          style={styles.toastAction}
        >
          <Text variant="label" style={{ color: t.surface, fontWeight: "700" }}>
            {current.action.label}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}

// ── Action sheet and confirm ─────────────────────────────────────────────

export type SheetAction = {
  label: string
  icon?: IconName
  destructive?: boolean
  onPress: () => void
}
type SheetRequest =
  | { kind: "actions"; title?: string; actions: SheetAction[] }
  | {
      kind: "confirm"
      title: string
      message?: string
      confirmLabel: string
      destructive?: boolean
      resolve: (ok: boolean) => void
    }

const useSheet = create<{ req: SheetRequest | null }>(() => ({ req: null }))

/**
 * A menu of choices from the bottom (More menus, option pickers). Not a
 * route: for quick choices that don't need a screen.
 */
export function showActions(actions: SheetAction[], title?: string) {
  useSheet.setState({ req: { kind: "actions", title, actions } })
}

/**
 * Ask before doing something: resolves true when confirmed. Say what will
 * happen and whether it can be undone.
 */
export function confirm(opts: {
  title: string
  message?: string
  confirmLabel: string
  destructive?: boolean
}): Promise<boolean> {
  if (opts.destructive) haptic.warning()
  return new Promise((resolve) =>
    useSheet.setState({ req: { kind: "confirm", ...opts, resolve } })
  )
}

function SheetHost() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const req = useSheet((s) => s.req)
  const close = React.useCallback((ok = false) => {
    const r = useSheet.getState().req
    if (r?.kind === "confirm") r.resolve(ok)
    useSheet.setState({ req: null })
  }, [])
  React.useEffect(() => {
    if (!req) return
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close(false)
      return true
    })
    return () => sub.remove()
  }, [req, close])
  if (!req) return null
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => close(false)}
    >
      <Pressable
        accessibilityLabel="Close"
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={() => close(false)}
      />
      <Animated.View
        entering={reduced ? undefined : SlideInDown.duration(220)}
        style={[
          styles.sheet,
          {
            backgroundColor: t.surface,
            paddingBottom: insets.bottom + Space[3],
          },
        ]}
      >
        <View style={[styles.grab, { backgroundColor: t.borderStrong }]} />
        {req.kind === "actions" ? (
          <ScrollView bounces={false} style={{ maxHeight: 480 }}>
            {req.title ? (
              <Text variant="callout" tone="muted" style={styles.sheetTitle}>
                {req.title}
              </Text>
            ) : null}
            {req.actions.map((a) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={() => {
                  close()
                  a.onPress()
                }}
                style={({ pressed }) => [
                  styles.action,
                  pressed && { backgroundColor: t.pressed },
                ]}
              >
                {a.icon ? (
                  <Icon
                    name={a.icon}
                    size={22}
                    tone={a.destructive ? "out" : "default"}
                  />
                ) : null}
                <Text variant="body" tone={a.destructive ? "out" : "default"}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => close()}
              style={({ pressed }) => [
                styles.action,
                pressed && { backgroundColor: t.pressed },
              ]}
            >
              <Text variant="body" tone="muted">
                Cancel
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={styles.confirm}>
            <Text variant="headline" accessibilityRole="header">
              {req.title}
            </Text>
            {req.message ? (
              <Text variant="body" tone="muted">
                {req.message}
              </Text>
            ) : null}
            <View style={styles.confirmRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => close(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={req.confirmLabel}
                  variant={req.destructive ? "danger" : "primary"}
                  onPress={() => close(true)}
                />
              </View>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
  )
}

/** Mount once at the root: toasts, action sheets and confirms render here. */
export function FeedbackHost() {
  return (
    <>
      <SheetHost />
      <ToastHost />
    </>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: Space[4],
    right: Space[4],
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    gap: Space[3],
    paddingLeft: Space[4],
    paddingRight: Space[2],
    paddingVertical: Space[2],
    minHeight: 52,
    borderRadius: Radius.lg,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastAction: {
    paddingHorizontal: Space[3],
    paddingVertical: Space[2],
    borderRadius: Radius.md,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space[2],
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Space[2],
  },
  sheetTitle: { paddingHorizontal: Space[5], paddingVertical: Space[2] },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[4],
    minHeight: 52,
    paddingHorizontal: Space[5],
  },
  confirm: { paddingHorizontal: Space[5], paddingTop: Space[2], gap: Space[3] },
  confirmRow: { flexDirection: "row", gap: Space[3], marginTop: Space[2] },
})
