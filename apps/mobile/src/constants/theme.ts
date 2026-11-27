/**
 * Billleaf colours for light and dark mode (brand: docs/product/brand.md).
 * Screens use these through `useTheme()`; plain StyleSheet, no styling lib.
 */
import { Platform } from "react-native"

const brand = {
  green: "#15803D",
  leaf: "#22A355",
  ink: "#142B2B",
} as const

export const Colors = {
  light: {
    text: brand.ink,
    textSecondary: "#5B6B6B",
    background: "#FFFFFF",
    backgroundElement: "#F3F6F4",
    backgroundSelected: "#E3EBE6",
    border: "#DDE5E2",
    primary: brand.green,
    onPrimary: "#FFFFFF",
    accent: brand.leaf,
    danger: "#B42318",
    /** Unresolved contract fields (the web's amber chips). */
    warning: "#92400E",
    warningBackground: "#FEF3C7",
    /** Android tab bar: the soft surface, and the pill behind the selected tab. */
    tabBar: "#F3F6F4",
    tabIndicator: "#D3EBDB",
  },
  dark: {
    text: "#ECF3EF",
    textSecondary: "#9FB1AA",
    background: "#0F1A1A",
    backgroundElement: "#172525",
    backgroundSelected: "#203232",
    border: "#2A3B3B",
    primary: brand.leaf,
    onPrimary: "#0F1A1A",
    accent: "#4ADE80",
    danger: "#F97066",
    warning: "#FDE68A",
    warningBackground: "#4A3510",
    tabBar: "#132121",
    tabIndicator: "#1E3F2D",
  },
} as const

export type Theme = (typeof Colors)["light"] | (typeof Colors)["dark"]
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark

export const Fonts = Platform.select({
  ios: { sans: "system-ui", rounded: "ui-rounded", mono: "ui-monospace" },
  default: { sans: "normal", rounded: "normal", mono: "monospace" },
})

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const

export const Radius = { sm: 6, md: 10, lg: 16, full: 999 } as const

export const Type = {
  title: { fontSize: 28, fontWeight: "700" },
  heading: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 16 },
  small: { fontSize: 13 },
  mono: { fontSize: 32, fontVariant: ["tabular-nums"] },
} as const
