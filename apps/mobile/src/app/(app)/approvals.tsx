import { addDays, formatDuration } from "@workspace/contracts"
import { router, Stack } from "expo-router"
import * as React from "react"
import { ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  Avatar,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  initialsOf,
  ListGroup,
  ListItem,
  RefreshControl,
  SkeletonRows,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  APPROVAL_FILTER_LABELS,
  APPROVAL_FILTERS,
  APPROVAL_STATUS_LABELS,
  type ApprovalFilter,
  STATUS_TONE,
  useTimesheetApprovals,
} from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { shortDate } from "@/lib/format"

/** Weeks members submitted: waiting ones first, to approve or send back. */
export default function ApprovalsScreen() {
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
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
  const off = list.data && !list.data.enabled

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <Stack.Screen options={{ title: "Approvals" }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[8] + playerInset },
        ]}
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
        {off ? null : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.chips}
          >
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
          </ScrollView>
        )}

        {list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data ? (
          <SkeletonRows rows={3} />
        ) : off ? (
          <EmptyState
            icon="checklist"
            title="Approvals are off"
            body="Turn timesheet approvals on in the web app under Settings → General."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title={
              filter === "submitted" ? "Nothing waiting" : "Nothing here yet"
            }
            body={
              filter === "submitted"
                ? "Weeks your team submits show here for you to approve."
                : "Reviewed weeks show here."
            }
          />
        ) : (
          <ListGroup>
            {items.map((a) => {
              const sub = `${week(a.weekStart)} · ${formatDuration(a.totalSeconds)}`
              return (
                <ListItem
                  key={a.id}
                  title={a.memberName}
                  subtitle={sub}
                  leading={
                    <Avatar label={initialsOf(a.memberName)} size={40} round />
                  }
                  trailing={
                    <Badge
                      label={APPROVAL_STATUS_LABELS[a.status]}
                      tone={STATUS_TONE[a.status]}
                    />
                  }
                  accessibilityLabel={`${a.memberName}, ${APPROVAL_STATUS_LABELS[a.status]}, ${sub}`}
                  onPress={() =>
                    router.push({
                      pathname: "/approval/[id]",
                      params: { id: a.id },
                    })
                  }
                />
              )
            })}
          </ListGroup>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Space[4],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  bleed: { marginHorizontal: -Space[4], flexGrow: 0 },
  chips: { gap: Space[2], paddingHorizontal: Space[4] },
})
