import type { RecurringStatus } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"

const STYLES: Record<
  RecurringStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  paused: { label: "Paused", variant: "secondary" },
  ended: { label: "Ended", variant: "outline" },
}

export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  const s = STYLES[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}
