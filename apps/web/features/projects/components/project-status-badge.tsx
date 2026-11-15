import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"

export function ProjectStatusBadge({
  status,
  overdue,
}: {
  status: ProjectStatus
  overdue?: boolean
}) {
  if (overdue) return <Badge variant="destructive">Overdue</Badge>
  const variant =
    status === "active"
      ? "secondary"
      : status === "completed"
        ? "default"
        : "outline"
  return <Badge variant={variant}>{PROJECT_STATUS_LABELS[status]}</Badge>
}
