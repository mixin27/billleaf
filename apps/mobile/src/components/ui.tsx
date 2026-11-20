import * as React from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
} from "react-native"

import { Radius, Spacing, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

/** Small set of themed building blocks (plain StyleSheet). */

export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      {children}
    </View>
  )
}

/**
 * Keeps focused fields above the keyboard on Android, where the app draws
 * edge to edge and the window no longer resizes for it. iOS scroll views
 * use `automaticallyAdjustKeyboardInsets` instead (KeyboardAvoidingView's
 * layout animation there made fields jump under your finger).
 */
export function KeyboardAvoid({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "android") return <>{children}</>
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      {children}
    </KeyboardAvoidingView>
  )
}

export function Title(props: TextProps) {
  const t = useTheme()
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[Type.title, { color: t.text }, props.style]}
    />
  )
}

export function Body({ muted, ...props }: TextProps & { muted?: boolean }) {
  const t = useTheme()
  return (
    <Text
      {...props}
      style={[
        Type.body,
        { color: muted ? t.textSecondary : t.text },
        props.style,
      ]}
    />
  )
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  const t = useTheme()
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={[Type.small, { color: t.text, fontWeight: "600" }]}>
        {label}
      </Text>
      <ClearableInput
        accessibilityLabel={label}
        placeholderTextColor={t.textSecondary}
        {...input}
        style={[
          styles.input,
          {
            color: t.text,
            backgroundColor: t.backgroundElement,
            borderColor: error ? t.danger : t.border,
          },
          input.style,
        ]}
      />
      {error ? (
        <Text style={[Type.small, { color: t.danger }]}>{error}</Text>
      ) : null}
    </View>
  )
}

/**
 * A TextInput whose `clearButtonMode` also works on Android, where React
 * Native ignores it: a ✕ at the end clears the text (iOS keeps its own).
 */
export function ClearableInput({
  containerStyle,
  ...props
}: TextInputProps & { containerStyle?: ViewStyle }) {
  const t = useTheme()
  const mode = props.clearButtonMode
  if (Platform.OS !== "android" || !mode || mode === "never") {
    return (
      <View style={containerStyle}>
        <TextInput {...props} />
      </View>
    )
  }
  // The wrapper stays put whether or not the ✕ shows, so typing the first
  // letter doesn't remount the input and drop the keyboard.
  const show = Boolean(props.value) && props.editable !== false
  return (
    <View style={[styles.clearable, containerStyle]}>
      <TextInput {...props} style={[props.style, styles.clearablePad]} />
      {show ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear text"
          hitSlop={8}
          onPress={() => props.onChangeText?.("")}
          style={({ pressed }) => [
            styles.clear,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <Text style={[styles.clearIcon, { color: t.textSecondary }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  ...rest
}: PressableProps & {
  title: string
  variant?: "primary" | "secondary" | "danger" | "link"
  loading?: boolean
}) {
  const t = useTheme()
  const off = disabled || loading
  const colors =
    variant === "primary"
      ? { bg: t.primary, fg: t.onPrimary, border: t.primary }
      : variant === "danger"
        ? { bg: t.danger, fg: "#FFFFFF", border: t.danger }
        : variant === "secondary"
          ? { bg: "transparent", fg: t.text, border: t.border }
          : { bg: "transparent", fg: t.primary, border: "transparent" }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        variant === "link" && styles.link,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <Text style={[Type.body, { color: colors.fg, fontWeight: "600" }]}>
          {title}
        </Text>
      )}
    </Pressable>
  )
}

/** A pill you pick from a set (category, payment method, date shortcut). */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.backgroundSelected : t.background,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[Type.small, { color: selected ? t.primary : t.text }]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** A titled card: "ITEMS", "CONTACTS", … with rows inside. */
export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={{ gap: Spacing.two }}>
      <Text
        accessibilityRole="header"
        style={[Type.small, { color: t.textSecondary, fontWeight: "600" }]}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: t.backgroundElement, borderColor: t.border },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  clearable: { justifyContent: "center" },
  clearablePad: { paddingRight: 44 },
  clear: {
    position: "absolute",
    right: 4,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  clearIcon: { fontSize: 16, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  link: { minHeight: 40 },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 36,
    justifyContent: "center",
  },
})
