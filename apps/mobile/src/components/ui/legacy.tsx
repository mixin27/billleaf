import * as React from "react"
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
} from "react-native"

import { Radius, Space, TextVariants, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

import { Icon, Text } from "./text"

/**
 * The building blocks screens used before the design system. They render
 * with the new tokens; screens move to the new components as they are
 * redesigned, and these go once none use them.
 */

export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme()
  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
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
    <RNText
      accessibilityRole="header"
      {...props}
      style={[Type.title, { color: t.text }, props.style]}
    />
  )
}

export function Body({ muted, ...props }: TextProps & { muted?: boolean }) {
  const t = useTheme()
  return (
    <RNText
      {...props}
      style={[Type.body, { color: muted ? t.textMuted : t.text }, props.style]}
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
    <View style={{ gap: Space[1] + 2 }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <ClearableInput
        accessibilityLabel={label}
        placeholderTextColor={t.textSubtle}
        {...input}
        style={[
          styles.input,
          TextVariants.body,
          {
            color: t.text,
            backgroundColor: t.surface,
            borderColor: error ? t.outFill : t.borderStrong,
          },
          input.style,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="out">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * A TextInput whose `clearButtonMode` also works on Android, where React
 * Native ignores it: a clear button at the end empties it (iOS keeps its own).
 */
export function ClearableInput({
  containerStyle,
  ...props
}: TextInputProps & { containerStyle?: ViewStyle }) {
  const mode = props.clearButtonMode
  if (Platform.OS !== "android" || !mode || mode === "never") {
    return (
      <View style={containerStyle}>
        <TextInput {...props} />
      </View>
    )
  }
  // The wrapper stays put whether or not the button shows, so typing the
  // first letter doesn't remount the input and drop the keyboard.
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
          <Icon name="close" size={18} tone="muted" />
        </Pressable>
      ) : null}
    </View>
  )
}

/** A titled group of rows: "ITEMS", "CONTACTS", … */
export function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <View style={{ gap: Space[2] }}>
      <Text variant="overline" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: t.surface, borderColor: t.border },
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
    borderRadius: Radius.lg - 2,
    paddingHorizontal: Space[4] - 2,
    paddingVertical: Space[1],
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
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space[3],
    paddingVertical: Space[3],
  },
})
