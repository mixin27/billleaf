import type { QuoteSummary } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"

const LABELS = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
} as const

export function QuoteStatusBadge({
  quote,
}: {
  quote: Pick<QuoteSummary, "status" | "isExpired">
}) {
  if (quote.isExpired) return <Badge variant="outline">Expired</Badge>
  const variant =
    quote.status === "accepted"
      ? "default"
      : quote.status === "declined"
        ? "destructive"
        : quote.status === "sent"
          ? "secondary"
          : "outline"
  return <Badge variant={variant}>{LABELS[quote.status]}</Badge>
}
