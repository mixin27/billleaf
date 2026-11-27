import { useIsFocused } from "expo-router"
import * as React from "react"
import type { LayoutChangeEvent } from "react-native"

import { useChrome } from "@/stores/chrome-store"

/**
 * For a screen's own bottom bar (Cash in / Cash out): while the screen is
 * focused, the timer's mini-player floats just above it. Pass the returned
 * handler as the bar's `onLayout`; `extra` is space below the bar that its
 * layout doesn't include (a safe-area inset added by a parent).
 */
export function useRegisterBottomBar(extra = 0) {
  const id = React.useId()
  const focused = useIsFocused()
  const [height, setHeight] = React.useState(0)
  React.useEffect(() => {
    const chrome = useChrome.getState()
    if (focused && height) chrome.setBottomBar(id, height + extra)
    else chrome.clearBottomBar(id)
  }, [id, focused, height, extra])
  // Gone (a selection bar replaced it): stop reserving its place.
  React.useEffect(() => () => useChrome.getState().clearBottomBar(id), [id])
  return React.useCallback((e: LayoutChangeEvent) => {
    // Ignore the squeeze while the keyboard is up under a sheet.
    const h = Math.round(e.nativeEvent.layout.height)
    if (h > 0) setHeight(h)
  }, [])
}
