import type { InvoiceDisplayStatus } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"

const STYLES: Record<
  InvoiceDisplayStatus,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  draft: { label: "Draft", variant: "outline" },
  open: { label: "Open", variant: "secondary" },
  overdue: { label: "Overdue", variant: "destructive" },
  partially_paid: { label: "Partially paid", variant: "secondary" },
  paid: { label: "Paid", variant: "default" },
  void: { label: "Void", variant: "outline" },
}

export function InvoiceStatusBadge({
  status,
}: {
  status: InvoiceDisplayStatus
}) {
  const s = STYLES[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export const INVOICE_STATUS_LABELS = Object.fromEntries(
  Object.entries(STYLES).map(([k, v]) => [k, v.label])
) as Record<InvoiceDisplayStatus, string>
