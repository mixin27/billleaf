import * as React from "react"
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Switch,
  View,
} from "react-native"

import { Radius, Space, TOUCH } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { haptic } from "@/lib/haptics"

import { Icon, type IconName, Text } from "./text"

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "danger"
  | "ghost"
  | "in"
  | "out"
  /** Old name for `ghost`. */
  | "link"

/**
 * The one button. `primary` is the screen's single main action; `in` and
 * `out` are Cash in / Cash out; `ghost` is a text button.
 */
export function Button({
  title,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth = true,
  ...rest
}: PressableProps & {
  title: string
  variant?: ButtonVariant
  size?: "sm" | "md" | "lg"
  icon?: IconName
  loading?: boolean
  fullWidth?: boolean
}) {
  const t = useTheme()
  const off = disabled || loading
  const v = variant === "link" ? "ghost" : variant
  const [bg, fg, ring] = {
    primary: [t.primary, t.onPrimary, null],
    secondary: [t.surface, t.text, t.borderStrong],
    tonal: [t.primarySoft, t.inText, null],
    danger: [t.outFill, t.onOut, null],
    ghost: ["transparent", t.inText, null],
    in: [t.inFill, t.onIn, null],
    out: [t.outFill, t.onOut, null],
  }[v]
  const height = size === "sm" ? 36 : size === "lg" ? 52 : TOUCH
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      hitSlop={size === "sm" ? 6 : 0}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: v === "ghost" ? 40 : height,
          paddingHorizontal: v === "ghost" ? Space[2] : Space[4],
          backgroundColor: bg as string,
          borderWidth: ring ? 1 : 0,
          borderColor: ring ?? "transparent",
          opacity: off ? 0.45 : 1,
          alignSelf: fullWidth && v !== "ghost" ? "stretch" : "flex-start",
        },
        pressed && !off && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg as string} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={fg as string} /> : null}
          <Text
            variant="label"
            style={{ color: fg as string, fontWeight: "600" }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

/** An icon-only button with a 48 target and a spoken label. */
export function IconButton({
  icon,
  label,
  tone = "default",
  onPress,
  disabled,
}: {
  icon: IconName
  label: string
  tone?: "default" | "muted" | "primary" | "out"
  onPress?: () => void
  disabled?: boolean
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed && { backgroundColor: t.pressed },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={22} tone={tone} />
    </Pressable>
  )
}

/**
 * A pill to pick or filter with. `caret` marks one that opens a menu
 * (Duration ▾); selected ones show a tick.
 */
export function Chip({
  label,
  selected,
  onPress,
  caret,
  icon,
}: {
  label: string
  selected: boolean
  onPress: () => void
  caret?: boolean
  icon?: IconName
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.selection()
        onPress()
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.primarySoft : t.surface,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {selected && !caret ? (
        <Icon name="check" size={16} tone="primary" />
      ) : icon ? (
        <Icon name={icon} size={16} tone="muted" />
      ) : null}
      <Text
        variant="label"
        style={{ color: selected ? t.inText : t.text }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caret ? (
        <Icon
          name="chevronDown"
          size={16}
          tone={selected ? "primary" : "muted"}
        />
      ) : null}
    </Pressable>
  )
}

/**
 * 2–4 options side by side (Cashbook / Expenses, Day / Week). `tones`
 * colours a selected option green or red (Cash in / Cash out).
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  tones,
}: {
  options: { value: V; label: string }[]
  value: V
  onChange: (v: V) => void
  tones?: Partial<Record<V, "in" | "out">>
}) {
  const t = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.seg, { backgroundColor: t.surfaceMuted }]}
    >
      {options.map((o) => {
        const on = o.value === value
        const tone = on ? tones?.[o.value] : undefined
        const bg =
          tone === "in" ? t.inFill : tone === "out" ? t.outFill : t.surface
        const fg =
          tone === "in"
            ? t.onIn
            : tone === "out"
              ? t.onOut
              : on
                ? t.text
                : t.textMuted
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) haptic.selection()
              onChange(o.value)
            }}
            style={[
              styles.segItem,
              on && { backgroundColor: bg, shadowColor: t.shadow },
              on && styles.segOn,
            ]}
          >
            <Text
              variant="label"
              style={{ color: fg, fontWeight: on ? "600" : "500" }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** One checkbox style for the whole app. */
export function Checkbox({ checked }: { checked: boolean }) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.check,
        {
          borderColor: checked ? t.primary : t.borderStrong,
          backgroundColor: checked ? t.primary : "transparent",
        },
      ]}
    >
      {checked ? (
        <Icon name="check" size={14} color={t.onPrimary} strokeWidth={2.5} />
      ) : null}
    </View>
  )
}

/** A brand-tinted switch. */
export function Toggle({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  label: string
}) {
  const t = useTheme()
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        haptic.selection()
        onValueChange(v)
      }}
      trackColor={{ true: t.primary, false: t.borderStrong }}
      thumbColor={t.surface}
      ios_backgroundColor={t.borderStrong}
    />
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  iconBtn: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[1],
    minHeight: 36,
    paddingHorizontal: Space[3],
    borderWidth: 1,
    borderRadius: Radius.full,
  },
  seg: {
    flexDirection: "row",
    padding: 3,
    borderRadius: Radius.md + 2,
    gap: 2,
  },
  segItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space[2],
  },
  segOn: {
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
})
