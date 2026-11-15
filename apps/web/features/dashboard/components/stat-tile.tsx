import { Card, CardContent } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"

/**
 * Headline number (a stat tile, not a chart). The primary-currency figure is
 * the hero; other currencies are listed beneath in muted ink.
 */
export function StatTile({
  label,
  values,
  hint,
  href,
  tone = "default",
}: {
  label: string
  /** Formatted amounts, primary currency first. Empty → shows a zero placeholder. */
  values: string[]
  hint?: React.ReactNode
  href?: string
  tone?: "default" | "critical"
}) {
  const [hero, ...rest] = values
  const body = (
    <CardContent className="flex flex-col gap-1">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
          tone === "critical" && values.length > 0 && "text-destructive"
        )}
      >
        {hero ?? "—"}
      </p>
      {rest.length > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {rest.join(" · ")}
        </p>
      ) : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </CardContent>
  )
  return (
    <Card className={cn(href && "transition-colors hover:bg-muted/40")}>
      {href ? (
        <Link href={href} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  )
}
