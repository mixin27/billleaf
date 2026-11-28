import type { ContractStatus, ContractSummary } from "@workspace/contracts"
import { router } from "expo-router"

import { Badge, type BadgeTone, IconTile, ListItem } from "@/components/ui"
import { CONTRACT_STATUS_LABELS } from "@/features/contracts"
import { shortDate } from "@/lib/format"

const TONES: Record<ContractStatus, BadgeTone> = {
  draft: "neutral",
  sent: "warning",
  signed: "in",
  declined: "out",
  void: "neutral",
}

/**
 * One contract in a list: client (or title, with `byTitle`), number and
 * the date that matters for its state. Opens the contract. Put rows in a
 * `ListGroup`.
 */
export function ContractRow({
  contract: c,
  locale,
  today,
  byTitle,
}: {
  contract: ContractSummary
  locale: string
  today: string | undefined
  /** @deprecated The ListGroup draws dividers. */
  first?: boolean
  byTitle?: boolean
}) {
  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const when =
    c.status === "signed" && c.signedAt
      ? `Signed ${date(c.signedAt)}`
      : c.status === "sent" && c.sentAt
        ? `Sent ${date(c.sentAt)}`
        : date(c.createdAt)
  const number = c.number ?? "Draft"
  const heading = byTitle ? (c.title ?? number) : c.clientName
  const sub = (byTitle ? [number, when] : [c.title ?? number, when])
    .filter(Boolean)
    .join(" · ")
  const status = CONTRACT_STATUS_LABELS[c.status]
  const tone = TONES[c.status]
  return (
    <ListItem
      title={heading}
      subtitle={sub}
      leading={
        <IconTile
          icon="contract"
          tone={tone === "in" ? "in" : tone === "out" ? "out" : "neutral"}
        />
      }
      trailing={<Badge label={status} tone={tone} />}
      accessibilityLabel={`${heading}, ${status}, ${sub}`}
      onPress={() =>
        router.push({ pathname: "/contract/[id]", params: { id: c.id } })
      }
    />
  )
}
