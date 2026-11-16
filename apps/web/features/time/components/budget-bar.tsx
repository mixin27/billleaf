import { cn } from "@workspace/ui/lib/utils"

/**
 * How much of an estimate is used. The bar turns amber at 80% and red at
 * 100%; the text always says the numbers, so colour is never the only cue.
 */
export function BudgetBar({
  label,
  used,
  estimate,
  usedText,
  estimateText,
  compact,
}: {
  label: string
  used: number
  estimate: number
  usedText: string
  estimateText: string
  compact?: boolean
}) {
  const pct = estimate > 0 ? Math.round((used / estimate) * 100) : 0
  return (
    <div className="flex flex-col gap-1">
      {compact ? null : (
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">
            {usedText} of {estimateText} ·{" "}
            <span className={cn(pct >= 100 && "font-medium")}>
              {pct >= 100 ? `${pct}%, over` : `${pct}%`}
            </span>
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuetext={`${usedText} of ${estimateText} (${pct}%)`}
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          compact ? "h-1.5" : "h-2"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 100
              ? "bg-destructive"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-primary"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

/** Hours with one decimal, e.g. "34.5 h". */
export const hoursLabel = (seconds: number) =>
  `${Math.round((seconds / 3600) * 10) / 10} h`
