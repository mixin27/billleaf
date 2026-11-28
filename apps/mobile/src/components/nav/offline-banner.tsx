import { onlineManager } from "@tanstack/react-query"
import * as React from "react"
import { StyleSheet } from "react-native"
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Icon, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

/** Whether the phone can reach the internet (see lib/query-client.ts). */
export function useOnline() {
  return React.useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline()
  )
}

/**
 * One quiet notice while the phone is offline, instead of an error on
 * every screen: screens keep what they last loaded and refresh by
 * themselves when the connection is back.
 */
export function OfflineBanner() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const online = useOnline()
  if (online) return null
  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(150)}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          top: insets.top + Space[1],
          backgroundColor: t.text,
          shadowColor: t.shadow,
        },
      ]}
    >
      <Icon name="offline" size={16} color={t.surface} />
      <Text variant="caption" style={{ color: t.surface }}>
        Offline · showing what was last loaded
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Space[2],
    paddingHorizontal: Space[3],
    paddingVertical: Space[1] + 2,
    borderRadius: Radius.full,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
})
