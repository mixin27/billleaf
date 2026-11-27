import { useColorScheme as useSystemScheme } from "react-native"

import { useAppearanceStore } from "@/stores/appearance-store"

/** "light" or "dark": the Appearance setting, or the phone's when System. */
export function useColorScheme(): "light" | "dark" {
  const system = useSystemScheme()
  const appearance = useAppearanceStore((s) => s.appearance)
  if (appearance !== "system") return appearance
  return system === "dark" ? "dark" : "light"
}
