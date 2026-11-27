import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker"
import { addDays } from "@workspace/contracts"
import * as React from "react"
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from "react-native"

import { font, Radius, Space, TextVariants } from "@/constants/theme"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { useTheme } from "@/hooks/use-theme"

import { Button, Chip } from "./controls"
import { Icon, type IconName, Text } from "./text"

/** A labelled input with a hint or an error under it. */
export function TextField({
  label,
  hint,
  error,
  icon,
  style,
  ...input
}: TextInputProps & {
  label: string
  hint?: string
  error?: string
  icon?: IconName
}) {
  const t = useTheme()
  const [focused, setFocused] = React.useState(false)
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View
        style={[
          styles.box,
          {
            backgroundColor: t.surface,
            borderColor: error
              ? t.outFill
              : focused
                ? t.primary
                : t.borderStrong,
            borderWidth: error || focused ? 2 : 1,
          },
        ]}
      >
        {icon ? <Icon name={icon} size={18} tone="muted" /> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.textSubtle}
          {...input}
          onFocus={(e) => {
            setFocused(true)
            input.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            input.onBlur?.(e)
          }}
          style={[styles.input, TextVariants.body, { color: t.text }, style]}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="out">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

/** The search box on lists. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string
  onChangeText: (s: string) => void
  placeholder: string
}) {
  const t = useTheme()
  return (
    <View style={[styles.search, { backgroundColor: t.surfaceMuted }]}>
      <Icon name="search" size={18} tone="muted" />
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        returnKeyType="search"
        autoCorrect={false}
        style={[styles.input, TextVariants.callout, { color: t.text }]}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={10}
          onPress={() => onChangeText("")}
        >
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * The big amount at the top of an entry or expense, tinted green or red.
 * `value` is what was typed; the caller parses it (lib/amount.ts).
 */
export function MoneyInput({
  value,
  onChangeText,
  currency,
  tone = "primary",
  decimals,
  autoFocus,
  error,
}: {
  value: string
  onChangeText: (s: string) => void
  currency: string
  tone?: "primary" | "in" | "out"
  decimals: boolean
  autoFocus?: boolean
  error?: string
}) {
  const t = useTheme()
  const ring = tone === "out" ? t.outFill : tone === "in" ? t.inFill : t.primary
  const fg = tone === "out" ? t.outText : tone === "in" ? t.inText : t.text
  return (
    <View style={{ gap: Space[1] }}>
      <View
        style={[
          styles.money,
          {
            backgroundColor: t.surfaceMuted,
            borderColor: error ? t.outFill : ring,
          },
        ]}
      >
        <Text variant="bodyStrong" tone="muted">
          {currency}
        </Text>
        <TextInput
          accessibilityLabel={`Amount in ${currency}`}
          value={value}
          onChangeText={onChangeText}
          keyboardType={decimals ? "decimal-pad" : "number-pad"}
          placeholder="0"
          placeholderTextColor={t.textSubtle}
          autoFocus={autoFocus}
          maxFontSizeMultiplier={1.3}
          style={[styles.moneyInput, { color: fg }]}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="out">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

/**
 * A date with Today / Yesterday shortcuts and the phone's own calendar
 * (inline in a sheet on iOS, the system dialog on Android). `value` and
 * `today` are YYYY-MM-DD.
 */
export function DateField({
  label,
  value,
  onChange,
  today,
  locale,
  optional,
}: {
  label: string
  value: string | null
  onChange: (iso: string | null) => void
  today: string
  locale: string
  optional?: boolean
}) {
  const t = useTheme()
  const scheme = useColorScheme()
  const [open, setOpen] = React.useState(false)
  const yesterday = addDays(today, -1)
  const shown = value
    ? value === today
      ? "Today"
      : value === yesterday
        ? "Yesterday"
        : new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "short",
            year:
              value.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
          }).format(dateOf(value))
    : "No date"
  const pick = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === "android") setOpen(false)
    if (e.type === "set" && d) onChange(isoOf(d))
  }
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}. Change`}
        onPress={() => setOpen(true)}
        style={[
          styles.box,
          {
            backgroundColor: t.surface,
            borderColor: t.borderStrong,
            borderWidth: 1,
          },
        ]}
      >
        <Icon name="calendar" size={18} tone="muted" />
        <Text variant="body" style={{ flex: 1 }}>
          {shown}
        </Text>
        <Icon name="chevronDown" size={18} tone="subtle" />
      </Pressable>
      <View style={styles.shortcuts}>
        <Chip
          label="Today"
          selected={value === today}
          onPress={() => onChange(today)}
        />
        <Chip
          label="Yesterday"
          selected={value === yesterday}
          onPress={() => onChange(yesterday)}
        />
        {optional && value ? (
          <Chip label="Clear" selected={false} onPress={() => onChange(null)} />
        ) : null}
      </View>
      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={dateOf(value ?? today)}
          mode="date"
          onChange={pick}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <PickerSheet open={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker
            value={dateOf(value ?? today)}
            mode="date"
            display="inline"
            themeVariant={scheme}
            accentColor={t.primary}
            onChange={pick}
          />
        </PickerSheet>
      ) : null}
    </View>
  )
}

/** A time of day ("HH:MM", 24-hour) with the phone's own clock picker. */
export function TimeField({
  label,
  value,
  onChange,
  locale,
}: {
  label: string
  value: string
  onChange: (hhmm: string) => void
  locale: string
}) {
  const t = useTheme()
  const scheme = useColorScheme()
  const [open, setOpen] = React.useState(false)
  const [h, m] = value.split(":").map(Number)
  const asDate = new Date(2000, 0, 1, h ?? 0, m ?? 0)
  const shown = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  })
    .format(asDate)
    .toLowerCase()
  const pick = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === "android") setOpen(false)
    if (e.type === "set" && d)
      onChange(`${pad(d.getHours())}:${pad(d.getMinutes())}`)
  }
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}. Change`}
        onPress={() => setOpen(true)}
        style={[
          styles.box,
          {
            backgroundColor: t.surface,
            borderColor: t.borderStrong,
            borderWidth: 1,
          },
        ]}
      >
        <Icon name="clock" size={18} tone="muted" />
        <Text variant="body" numeric style={{ flex: 1 }}>
          {shown}
        </Text>
      </Pressable>
      {open && Platform.OS === "android" ? (
        <DateTimePicker value={asDate} mode="time" onChange={pick} />
      ) : null}
      {Platform.OS === "ios" ? (
        <PickerSheet open={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker
            value={asDate}
            mode="time"
            display="spinner"
            themeVariant={scheme}
            onChange={pick}
          />
        </PickerSheet>
      ) : null}
    </View>
  )
}

/** iOS only: the picker in a small sheet with Done. */
function PickerSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={onClose}
      />
      <View style={[styles.pickerSheet, { backgroundColor: t.surface }]}>
        <Text variant="headline">{title}</Text>
        {children}
        <Button title="Done" onPress={onClose} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  field: { gap: Space[1] + 2 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    minHeight: 48,
    paddingHorizontal: Space[3],
    borderRadius: Radius.md,
  },
  input: { flex: 1, paddingVertical: Space[2] + 2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    minHeight: 44,
    paddingHorizontal: Space[3],
    borderRadius: Radius.md + 2,
  },
  money: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    paddingHorizontal: Space[4],
    paddingVertical: Space[2],
    borderRadius: Radius.lg,
    borderWidth: 2,
  },
  moneyInput: {
    flex: 1,
    ...font("700"),
    fontSize: 32,
    lineHeight: 40,
    fontVariant: ["tabular-nums"],
    paddingVertical: Space[1],
  },
  shortcuts: { flexDirection: "row", gap: Space[2], flexWrap: "wrap" },
  pickerSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: Space[4],
    paddingBottom: Space[10],
    gap: Space[3],
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
})
