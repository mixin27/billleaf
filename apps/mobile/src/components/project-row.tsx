import {
  formatDuration,
  type Project,
  PROJECT_STATUS_LABELS,
} from "@workspace/contracts"
import { router } from "expo-router"

import { Badge, IconTile, ListItem, Text } from "@/components/ui"
import { shortDate } from "@/lib/format"

/**
 * One project in a list: name, client (unless `noClient`), due date or
 * status, and the time tracked on it. Opens the project. Put rows in a
 * `ListGroup`.
 */
export function ProjectRow({
  project: p,
  locale,
  today,
  noClient,
}: {
  project: Project
  /** @deprecated The ListGroup draws dividers. */
  first?: boolean
  locale: string
  today: string | undefined
  noClient?: boolean
}) {
  const active = p.status === "active"
  const due =
    active && p.dueDate
      ? `${p.isOverdue ? "Overdue, was due" : "Due"} ${shortDate(p.dueDate, locale, today)}`
      : null
  const status = active ? null : PROJECT_STATUS_LABELS[p.status]
  const client = noClient ? null : p.clientName
  const sub = [client, due].filter(Boolean).join(" · ")
  const tracked = formatDuration(p.trackedSeconds)
  return (
    <ListItem
      title={p.name}
      subtitle={
        sub ? (
          <Text
            variant="callout"
            tone={p.isOverdue ? "out" : "muted"}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : undefined
      }
      leading={
        <IconTile
          icon="folder"
          tone={p.isOverdue ? "out" : active ? "primary" : "neutral"}
        />
      }
      trailing={
        <>
          <Text variant="label" tone="muted" numeric numberOfLines={1}>
            {tracked}
          </Text>
          {status ? <Badge label={status} /> : null}
        </>
      }
      accessibilityLabel={[p.name, client, due ?? status, `${tracked} tracked`]
        .filter(Boolean)
        .join(", ")}
      onPress={() =>
        router.push({ pathname: "/project/[id]", params: { id: p.id } })
      }
    />
  )
}
