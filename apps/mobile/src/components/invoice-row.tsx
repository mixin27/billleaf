import {
  formatMoney,
  type InvoiceDisplayStatus,
  type InvoiceSummary,
} from "@workspace/contracts"
import { router } from "expo-router"

import {
  Badge,
  type BadgeTone,
  IconTile,
  ListItem,
  Text,
} from "@/components/ui"
import { INVOICE_STATUS_LABELS } from "@/features/invoices"
import { shortDate } from "@/lib/format"

const TONES: Record<InvoiceDisplayStatus, BadgeTone> = {
  draft: "neutral",
  open: "info",
  overdue: "out",
  partially_paid: "warning",
  paid: "in",
  void: "neutral",
}

/**
 * One invoice in a list: who (or which number), what's due or the total,
 * and its status. Opens the invoice. `byNumber` leads with the number,
 * for lists that are already one client's. Put rows in a `ListGroup`
 * (`first` is no longer needed: the group draws the dividers).
 */
export function InvoiceRow({
  invoice: inv,
  locale,
  today,
  byNumber,
}: {
  invoice: InvoiceSummary
  locale: string
  today: string | undefined
  /** @deprecated The ListGroup draws dividers. */
  first?: boolean
  byNumber?: boolean
}) {
  const owing = inv.displayStatus !== "paid" && inv.displayStatus !== "void"
  const amount = formatMoney(
    {
      amount: owing && inv.status === "issued" ? inv.amountDue : inv.total,
      currency: inv.currency,
    },
    locale
  )
  const when =
    inv.status === "issued" && owing && inv.dueDate
      ? `Due ${shortDate(inv.dueDate, locale, today)}`
      : shortDate(inv.issueDate, locale, today)
  const number = inv.number ?? "Draft"
  const heading = byNumber ? number : inv.clientName
  const sub = (byNumber ? [inv.title, when] : [number, when])
    .filter(Boolean)
    .join(" · ")
  const status = INVOICE_STATUS_LABELS[inv.displayStatus]
  const tone = TONES[inv.displayStatus]
  return (
    <ListItem
      title={heading}
      subtitle={sub}
      leading={
        <IconTile
          icon="invoice"
          tone={tone === "out" ? "out" : tone === "in" ? "in" : "neutral"}
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
        router.push({ pathname: "/invoice/[id]", params: { id: inv.id } })
      }
    />
  )
}

/** What's still owed on these invoices, per currency. */
export function totalsByCurrency(items: InvoiceSummary[]) {
  const m = new Map<string, number>()
  for (const i of items)
    m.set(i.currency, (m.get(i.currency) ?? 0) + i.amountDue)
  return [...m].map(([currency, amount]) => ({ currency, amount }))
}
