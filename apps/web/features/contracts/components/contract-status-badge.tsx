import type { ContractStatus } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"

const STYLES: Record<
  ContractStatus,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  draft: { label: "Draft", variant: "outline" },
  sent: { label: "Awaiting signature", variant: "secondary" },
  signed: { label: "Signed", variant: "default" },
  declined: { label: "Declined", variant: "destructive" },
  void: { label: "Void", variant: "outline" },
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const s = STYLES[status]
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export const CONTRACT_STATUS_LABELS = Object.fromEntries(
  Object.entries(STYLES).map(([k, v]) => [k, v.label])
) as Record<ContractStatus, string>
