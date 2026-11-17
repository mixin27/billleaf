import * as React from "react"
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
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
      <TextInput
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

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  ...rest
}: PressableProps & {
  title: string
  variant?: "primary" | "secondary" | "link"
  loading?: boolean
}) {
  const t = useTheme()
  const off = disabled || loading
  const colors =
    variant === "primary"
      ? { bg: t.primary, fg: t.onPrimary, border: t.primary }
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
})
