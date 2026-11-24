import { addDays, formatDuration } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { Body, Chip, Screen, Section } from "@/components/ui"
import { Spacing, Type } from "@/constants/theme"
import {
  APPROVAL_FILTER_LABELS,
  APPROVAL_FILTERS,
  APPROVAL_STATUS_LABELS,
  type ApprovalFilter,
  useTimesheetApprovals,
} from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

/** Weeks members submitted: waiting ones first, to approve or send back. */
export default function ApprovalsScreen() {
  const t = useTheme()
  const [filter, setFilter] = React.useState<ApprovalFilter>("submitted")
  const list = useTimesheetApprovals(filter)
  const today = useDashboard().data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [refreshing, setRefreshing] = React.useState(false)
  const week = (start: string) =>
    `${shortDate(start, locale, today)} – ${shortDate(addDays(start, 6), locale, today)}`
  const items = list.data?.items ?? []

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await list.refetch()
              setRefreshing(false)
            }}
          />
        }
      >
        <View style={styles.chips}>
          {APPROVAL_FILTERS.map((f) => (
            <Chip
              key={f}
              label={
                f === "submitted" && list.data?.pendingCount
                  ? `${APPROVAL_FILTER_LABELS[f]} · ${list.data.pendingCount}`
                  : APPROVAL_FILTER_LABELS[f]
              }
              selected={filter === f}
              onPress={() => setFilter(f)}
            />
          ))}
        </View>

        {list.error ? (
          <Body>{errorMessage(list.error)}</Body>
        ) : !list.data ? (
          <Body muted>Loading…</Body>
        ) : !list.data.enabled ? (
          <Body muted>
            Timesheet approvals are off for this workspace. Turn them on in the
            web app under Settings → General.
          </Body>
        ) : items.length === 0 ? (
          <Body muted>
            {filter === "submitted"
              ? "No timesheets are waiting for approval."
              : "Nothing here yet."}
          </Body>
        ) : (
          <Section title={APPROVAL_FILTER_LABELS[filter]}>
            {items.map((a, i) => {
              const status = APPROVAL_STATUS_LABELS[a.status]
              const sub = `${week(a.weekStart)} · ${formatDuration(a.totalSeconds)}`
              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.memberName}, ${status}, ${sub}`}
                  onPress={() =>
                    router.push({
                      pathname: "/approval/[id]",
                      params: { id: a.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text
                      style={[Type.body, { color: t.text }]}
                      numberOfLines={1}
                    >
                      {a.memberName}
                    </Text>
                    <Text
                      style={[Type.small, { color: t.textSecondary }]}
                      numberOfLines={1}
                    >
                      {sub}
                    </Text>
                  </View>
                  <Text
                    style={[
                      Type.small,
                      {
                        color:
                          a.status === "approved"
                            ? t.primary
                            : a.status === "rejected"
                              ? t.danger
                              : t.textSecondary,
                      },
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              )
            })}
          </Section>
        )}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.two },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
})
