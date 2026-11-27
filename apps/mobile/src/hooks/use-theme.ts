import { Colors } from "@/constants/theme"
import { useColorScheme } from "@/hooks/use-color-scheme"

/** The colour tokens for the current appearance (see constants/theme.ts). */
export function useTheme() {
  return Colors[useColorScheme()]
}
