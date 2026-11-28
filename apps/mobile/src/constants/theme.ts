/**
 * Billleaf mobile design tokens (brand: docs/product/brand.md; the
 * proposal: the "Billleaf Mobile Redesign" artifact). Screens use these
 * names only: raw colours in `src/app` and `src/components` fail the
 * colour check (scripts/check-colours.mjs).
 *
 * Surfaces: `canvas` is the page, `surface` the cards, rows, bars and
 * sheets on it. Money: `in*` for cash in and money received, `out*` for
 * cash out, overdue, errors and destructive actions. Text on a fill uses
 * the matching `on*` colour.
 */
import type { TextStyle } from "react-native"

const brand = {
  green: "#15803D",
  leaf: "#22A355",
  ink: "#142B2B",
} as const

const light = {
  canvas: "#F5F7F6",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2F0",
  surfaceSelected: "#E1EBE5",
  pressed: "rgba(20,43,43,0.06)",
  border: "#DDE5E2",
  borderStrong: "#C5D1CC",
  text: brand.ink,
  textMuted: "#5B6B6B",
  textSubtle: "#7C8A88",
  primary: brand.green,
  primaryPressed: "#116632",
  primarySoft: "#E7F6EC",
  onPrimary: "#FFFFFF",
  inText: brand.green,
  inFill: brand.green,
  inSoft: "#E7F6EC",
  onIn: "#FFFFFF",
  outText: "#B42318",
  outFill: "#B42318",
  outSoft: "#FDECEA",
  onOut: "#FFFFFF",
  warning: "#92400E",
  warningSoft: "#FEF3C7",
  info: "#1D4ED8",
  infoSoft: "#E0EAFF",
  scrim: "rgba(11,20,20,0.45)",
  /** Text and icons on the scrim (always light). */
  onScrim: "#FFFFFF",
  shadow: "#000000",
} as const

const dark = {
  canvas: "#0B1414",
  surface: "#132020",
  surfaceMuted: "#1A2A2A",
  surfaceSelected: "#223535",
  pressed: "rgba(236,243,239,0.08)",
  border: "#2A3B3B",
  borderStrong: "#3A4D4D",
  text: "#ECF3EF",
  textMuted: "#9FB1AA",
  textSubtle: "#74867F",
  primary: brand.leaf,
  primaryPressed: "#1C8A47",
  primarySoft: "#15301F",
  onPrimary: "#04170C",
  inText: "#4ADE80",
  inFill: brand.leaf,
  inSoft: "#15301F",
  onIn: "#04170C",
  outText: "#F97066",
  outFill: "#F97066",
  outSoft: "#3A1513",
  onOut: "#2A0B08",
  warning: "#FDE68A",
  warningSoft: "#4A3510",
  info: "#93B4FF",
  infoSoft: "#18264A",
  scrim: "rgba(0,0,0,0.6)",
  onScrim: "#FFFFFF",
  shadow: "#000000",
} as const

export const Colors = { light, dark }

export type Theme = (typeof Colors)["light"] | (typeof Colors)["dark"]
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark

/** 4-point spacing: `Space[3]` is 12. */
export const Space = {
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

/** 8 is the default (buttons, inputs, list groups), as on the web. */
export const Radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const

/** Minimum touch target on both platforms. */
export const TOUCH = 48

type Weight = "400" | "500" | "600" | "700"

/**
 * Inter at a weight. Embedded at build time (expo-font plugin in app.json):
 * one "Inter" family on Android (font XML with weights), and on iOS the
 * family name the files share.
 */
export function font(weight: Weight = "400"): TextStyle {
  return { fontFamily: "Inter", fontWeight: weight }
}

const num: TextStyle = { fontVariant: ["tabular-nums"] }

/** The type scale. `Text` maps its `variant` to these. */
export const TextVariants = {
  display: {
    ...font("700"),
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
    ...num,
  },
  title: { ...font("700"), fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  headline: { ...font("600"), fontSize: 18, lineHeight: 24 },
  body: { ...font("400"), fontSize: 16, lineHeight: 22 },
  bodyStrong: { ...font("600"), fontSize: 16, lineHeight: 22 },
  callout: { ...font("400"), fontSize: 14, lineHeight: 20 },
  label: { ...font("500"), fontSize: 14, lineHeight: 20 },
  caption: { ...font("500"), fontSize: 12, lineHeight: 16 },
  overline: {
    ...font("600"),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
} satisfies Record<string, TextStyle>

export type TextVariant = keyof typeof TextVariants

/** Motion durations (ms); collapse to fades with reduced motion. */
export const Motion = { press: 120, enter: 200, segment: 250 } as const
