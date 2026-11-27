import { useWindowDimensions } from "react-native"

import { type Breakpoint, breakpointFor } from "@/lib/breakpoint"

export {
  type Breakpoint,
  breakpointFor,
  MAX_CONTENT_WIDTH,
} from "@/lib/breakpoint"

export function useBreakpoint(): Breakpoint {
  return breakpointFor(useWindowDimensions().width)
}
