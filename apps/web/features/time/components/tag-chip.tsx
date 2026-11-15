import type { Tag, TagColor } from "@workspace/contracts"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Tag colours are user-chosen identity labels, so they use fixed hues (the one
 * place outside charts where raw palette classes are allowed). Text stays
 * readable in both themes; the name is always shown, never colour alone.
 */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  gray: "bg-muted text-muted-foreground",
  green: "bg-green-500/12 text-green-800 dark:text-green-300",
  teal: "bg-teal-500/12 text-teal-800 dark:text-teal-300",
  blue: "bg-blue-500/12 text-blue-800 dark:text-blue-300",
  violet: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  pink: "bg-pink-500/12 text-pink-800 dark:text-pink-300",
  red: "bg-red-500/12 text-red-800 dark:text-red-300",
  orange: "bg-orange-500/12 text-orange-800 dark:text-orange-300",
  amber: "bg-amber-500/15 text-amber-900 dark:text-amber-300",
}

export const TAG_DOT_CLASSES: Record<TagColor, string> = {
  gray: "bg-muted-foreground/60",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
}

export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-32 items-center truncate rounded px-1.5 text-xs font-medium",
        TAG_COLOR_CLASSES[tag.color ?? "gray"],
        className
      )}
    >
      {tag.name}
    </span>
  )
}
