import { Image } from "expo-image"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import { Icon, Text } from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

/**
 * An attachment: the photo (or the file name for a PDF), opening it on
 * tap, with a remove button when `onRemove` is given.
 */
export function PhotoThumb({
  uri,
  label,
  onPress,
  onRemove,
}: {
  uri: string | null
  label: string
  onPress?: () => void
  onRemove?: () => void
}) {
  const t = useTheme()
  return (
    <View>
      <Pressable
        accessibilityRole={onPress ? "button" : "image"}
        accessibilityLabel={onPress ? `Open ${label}` : label}
        disabled={!onPress}
        onPress={onPress}
        style={[
          styles.thumb,
          { borderColor: t.border, backgroundColor: t.surfaceMuted },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.file}>
            <Icon name="attach" size={20} tone="muted" />
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          hitSlop={10}
          onPress={onRemove}
          style={[styles.remove, { backgroundColor: t.text }]}
        >
          <Icon name="close" size={14} color={t.surface} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  thumb: {
    width: 84,
    height: 84,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  file: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space[1],
    padding: Space[2],
  },
  remove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
})
