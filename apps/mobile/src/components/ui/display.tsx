import * as React from "react"
import { StyleSheet, View } from "react-native"

import { Radius, Space, type TextVariant } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { type AmountSign, signedAmount } from "@/lib/money-display"

import { Text } from "./text"

const AMOUNT_SIZE: Record<"xl" | "l" | "m" | "s", TextVariant> = {
  xl: "display",
  l: "headline",
  m: "bodyStrong",
  s: "callout",
}

/**
 * Money, CashBook style: a plain number in the currency's decimals,
 * green "+" for in, red "−" for out (`sign`), tabular digits.
 */
export function Amount({
  value,
  currency,
  locale,
  sign = "none",
  size = "m",
  tone,
}: {
  value: number
  currency: string
  locale?: string
  sign?: AmountSign
  size?: keyof typeof AMOUNT_SIZE
  tone?: "default" | "muted"
}) {
  const a = signedAmount(value, currency, locale, sign)
  return (
    <Text
      variant={AMOUNT_SIZE[size]}
      tone={tone ?? a.tone}
      numeric
      maxFontSizeMultiplier={1.4}
    >
      {a.text}
    </Text>
  )
}

export type BadgeTone =
  "neutral" | "primary" | "in" | "out" | "warning" | "info"

/** A short status label on a soft background. Never colour alone. */
export function Badge({
  label,
  tone = "neutral",
}: {
  label: string
  tone?: BadgeTone
}) {
  const t = useTheme()
  const c = {
    neutral: [t.surfaceMuted, t.textMuted],
    primary: [t.primarySoft, t.inText],
    in: [t.inSoft, t.inText],
    out: [t.outSoft, t.outText],
    warning: [t.warningSoft, t.warning],
    info: [t.infoSoft, t.info],
  }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: c[0] }]}>
      <Text variant="caption" style={{ color: c[1] }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

/** Initials (or a letter tile for a workspace or book). */
export function Avatar({
  label,
  size = 32,
  round,
  tone = "primary",
}: {
  label: string
  size?: 24 | 32 | 40 | 56
  round?: boolean
  tone?: "primary" | "neutral" | "solid"
}) {
  const t = useTheme()
  const [bg, fg] =
    tone === "solid"
      ? [t.primary, t.onPrimary]
      : tone === "neutral"
        ? [t.surfaceMuted, t.text]
        : [t.primarySoft, t.inText]
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : Math.round(size * 0.28),
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        variant={size >= 40 ? "bodyStrong" : "caption"}
        style={{ color: fg, fontWeight: "700" }}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
    </View>
  )
}

/** "Aye Aye Trading" → "AA". */
export function initialsOf(name: string) {
  // Letters and digits only: "[SAMPLE] Client A" → "SA", not "[A".
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const s =
    parts.length > 1
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`
      : (parts[0]?.slice(0, 2) ?? "?")
  return s.toUpperCase()
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: Space[2],
    paddingVertical: Space[0.5],
    borderRadius: Radius.xs + 1,
  },
})
