import { HugeiconsIcon } from "@hugeicons/react-native"
import * as React from "react"
import { Text as RNText, type TextProps as RNTextProps } from "react-native"

import { type Theme, type TextVariant, TextVariants } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"

import { ICON_DATA, type IconName } from "./icon-data"

export type Tone =
  | "default"
  | "muted"
  | "subtle"
  | "primary"
  | "in"
  | "out"
  | "warning"
  | "info"
  | "onPrimary"

export function toneColor(t: Theme, tone: Tone): string {
  switch (tone) {
    case "muted":
      return t.textMuted
    case "subtle":
      return t.textSubtle
    case "primary":
    case "in":
      return t.inText
    case "out":
      return t.outText
    case "warning":
      return t.warning
    case "info":
      return t.info
    case "onPrimary":
      return t.onPrimary
    default:
      return t.text
  }
}

/**
 * All text in the app: a variant from the type scale (Inter) and a tone.
 * `numeric` lines digits up (money, durations).
 */
export function Text({
  variant = "body",
  tone = "default",
  numeric,
  style,
  ...props
}: RNTextProps & { variant?: TextVariant; tone?: Tone; numeric?: boolean }) {
  const t = useTheme()
  return (
    <RNText
      maxFontSizeMultiplier={variant === "display" ? 1.4 : undefined}
      {...props}
      style={[
        TextVariants[variant],
        { color: toneColor(t, tone) },
        numeric && { fontVariant: ["tabular-nums"] },
        style,
      ]}
    />
  )
}

/**
 * A Hugeicons icon (the set the web uses). Names come from
 * scripts/icons.mjs; decorative unless given a label.
 */
export function Icon({
  name,
  size = 22,
  color,
  tone = "default",
  strokeWidth = 1.8,
}: {
  name: IconName
  size?: number
  color?: string
  tone?: Tone
  strokeWidth?: number
}) {
  const t = useTheme()
  return (
    <HugeiconsIcon
      icon={ICON_DATA[name] as never}
      size={size}
      color={color ?? toneColor(t, tone)}
      strokeWidth={strokeWidth}
      accessible={false}
      importantForAccessibility="no"
    />
  )
}

export type { IconName }
