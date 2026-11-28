import * as React from "react"
import { KeyboardAvoidingView, Platform, StyleSheet } from "react-native"

/**
 * Keeps focused fields above the keyboard on Android, where the app draws
 * edge to edge and the window no longer resizes for it. iOS scroll views
 * use `automaticallyAdjustKeyboardInsets` instead (KeyboardAvoidingView's
 * layout animation there made fields jump under your finger).
 */
export function KeyboardAvoid({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "android") return <>{children}</>
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      {children}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({ flex: { flex: 1 } })
