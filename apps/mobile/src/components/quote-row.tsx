import { formatMoney, type QuoteSummary } from "@workspace/contracts"
import { router } from "expo-router"

import {
  Badge,
  type BadgeTone,
  IconTile,
  ListItem,
  Text,
} from "@/components/ui"
import {
  QUOTE_STATUS_LABELS,
  type QuoteDisplay,
  quoteDisplay,
} from "@/features/quotes"
import { shortDate } from "@/lib/format"

const TONES: Record<QuoteDisplay, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  accepted: "in",
  declined: "out",
  expired: "warning",
}

/**
 * One quote in a list: client (or number, with `byNumber`), total and
 * status, with when it expires while it's waiting. Opens the quote. Put
 * rows in a `ListGroup`.
 */
export function QuoteRow({
  quote: q,
  locale,
  today,
  byNumber,
}: {
  quote: QuoteSummary
  locale: string
  today: string | undefined
  /** @deprecated The ListGroup draws dividers. */
  first?: boolean
  byNumber?: boolean
}) {
  const display = quoteDisplay(q)
  const amount = formatMoney({ amount: q.total, currency: q.currency }, locale)
  const when =
    q.status === "sent" && q.validUntil
      ? `${q.isExpired ? "Expired" : "Valid until"} ${shortDate(q.validUntil, locale, today)}`
      : shortDate(q.issueDate, locale, today)
  const number = q.number ?? "Draft"
  const heading = byNumber ? number : q.clientName
  const sub = (byNumber ? [q.title, when] : [number, when])
    .filter(Boolean)
    .join(" · ")
  const status = QUOTE_STATUS_LABELS[display]
  const tone = TONES[display]
  return (
    <ListItem
      title={heading}
      subtitle={sub}
      leading={
        <IconTile
          icon="quote"
          tone={tone === "in" ? "in" : tone === "out" ? "out" : "neutral"}
        />
      }
      trailing={
        <>
          <Text variant="bodyStrong" numeric numberOfLines={1}>
            {amount}
          </Text>
          <Badge label={status} tone={tone} />
        </>
      }
      accessibilityLabel={`${heading}, ${amount}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/quote/[id]", params: { id: q.id } })
      }
    />
  )
}
