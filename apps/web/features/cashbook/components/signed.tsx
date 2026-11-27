import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

/**
 * Money coloured by direction, as in the CashBook app: green for cash in
 * (or a positive balance), red for cash out (or a negative one). The text
 * always carries a sign or label too, so colour is never the only cue.
 */
export function Signed({
  value,
  out,
  className,
  children,
}: {
  /** A balance: negative is red. */
  value?: number
  /** An entry: true is red. */
  out?: boolean
  className?: string
  children: React.ReactNode
}) {
  const red = out ?? (value !== undefined && value < 0)
  return (
    <span
      className={cn(
        "tabular-nums",
        red ? "text-destructive" : "text-primary",
        className
      )}
    >
      {children}
    </span>
  )
}
