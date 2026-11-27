export type Breakpoint = "compact" | "medium" | "expanded"

/**
 * compact (< 600): phones, bottom bar. medium (600–839): tablet portrait,
 * a side rail and one centred pane. expanded (≥ 840): rail plus list and
 * detail side by side.
 */
export function breakpointFor(width: number): Breakpoint {
  if (width >= 840) return "expanded"
  if (width >= 600) return "medium"
  return "compact"
}

/** Widest a form or detail column gets on a tablet. */
export const MAX_CONTENT_WIDTH = 640
