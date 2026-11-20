import {
  formatDuration,
  type Project,
  PROJECT_STATUS_LABELS,
} from "@workspace/contracts"
import { router } from "expo-router"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { Spacing, Type } from "@/constants/theme"
import { useTheme } from "@/hooks/use-theme"
import { shortDate } from "@/lib/format"

/**
 * One project in a list: name, client (unless `noClient`), due date or
 * status, and the time tracked on it. Opens the project.
 */
export function ProjectRow({
  project: p,
  first,
  locale,
  today,
  noClient,
}: {
  project: Project
  first: boolean
  locale: string
  today: string | undefined
  noClient?: boolean
}) {
  const t = useTheme()
  const when =
    p.status !== "active"
      ? PROJECT_STATUS_LABELS[p.status]
      : p.dueDate
        ? `${p.isOverdue ? "Overdue, was due" : "Due"} ${shortDate(p.dueDate, locale, today)}`
        : null
  const sub = [noClient ? null : p.clientName, when].filter(Boolean).join(" · ")
  const tracked = formatDuration(p.trackedSeconds)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[p.name, sub, `${tracked} tracked`]
        .filter(Boolean)
        .join(", ")}
      onPress={() =>
        router.push({ pathname: "/project/[id]", params: { id: p.id } })
      }
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
          {p.name}
        </Text>
        {sub ? (
          <Text
            style={[
              Type.small,
              { color: p.isOverdue ? t.danger : t.textSecondary },
            ]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={[Type.body, styles.num, { color: t.textSecondary }]}>
        {tracked}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  num: { fontVariant: ["tabular-nums"] },
})
