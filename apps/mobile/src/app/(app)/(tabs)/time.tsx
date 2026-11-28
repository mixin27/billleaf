import {
  addDays,
  formatDuration,
  type TimeEntry,
  weekStart as weekStartOf,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"

import { useMiniPlayerInset } from "@/components/nav/mini-player"
import {
  TimeEntryRow,
  WeekStatusCard,
  WeekStrip,
} from "@/components/time/time-parts"
import {
  AppBar,
  EmptyState,
  ErrorState,
  Fab,
  IconTile,
  ListGroup,
  ListItem,
  RefreshControl,
  SectionHeader,
  SegmentedControl,
  SkeletonRows,
  Text,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import { useTimesheetApprovals } from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import { useTimeEntries } from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { dayHeading } from "@/lib/cashbook"
import { queryClient } from "@/lib/query-client"
import { useReminderSettings } from "@/stores/reminder-settings"

type View_ = "day" | "week"

/**
 * Your time: a week strip to pick a day, that day's entries (or the whole
 * week with where it stands for approval), and Log time. The timer itself
 * is the dock in the middle of the bar.
 */
export default function TimeScreen() {
  const t = useTheme()
  const playerInset = useMiniPlayerInset()
  const dashboard = useDashboard()
  const today = dashboard.data?.today
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const [picked, setPicked] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View_>("day")
  const day = picked ?? today
  const ws = day ? weekStartOf(day) : undefined

  // A "your week was reviewed" push (or Home) opens on that week (?week=).
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>()
  React.useEffect(() => {
    if (!weekParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekParam) || !today) return
    setPicked(weekParam >= weekStartOf(today) ? null : weekParam)
    setView("week")
    router.setParams({ week: undefined })
  }, [weekParam, today])

  const entries = useTimeEntries(
    { from: ws ?? "", to: ws ? addDays(ws, 6) : "", memberId: "me" },
    Boolean(ws)
  )
  const items = entries.data?.items
  const { totals, byDay } = React.useMemo(() => {
    const totals = new Map<string, number>()
    const byDay = new Map<string, TimeEntry[]>()
    for (const e of items ?? []) {
      totals.set(
        e.entryDate,
        (totals.get(e.entryDate) ?? 0) + (e.durationSeconds ?? 0)
      )
      byDay.set(e.entryDate, [...(byDay.get(e.entryDate) ?? []), e])
    }
    return { totals, byDay }
  }, [items])
  const weekTotal = entries.data?.totalSeconds ?? 0
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["time"] }),
      dashboard.refetch(),
    ])
    setRefreshing(false)
  }

  const select = (d: string) => {
    if (!today) return
    setPicked(d >= today ? null : d)
  }

  const dayEntries = day ? (byDay.get(day) ?? []) : []
  const days = ws
    ? Array.from({ length: 7 }, (_, i) => addDays(ws, 6 - i)).filter((d) =>
        byDay.has(d)
      )
    : []

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <AppBar title="Time" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Space[16] + Space[4] + playerInset },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <ApprovalsRow />
        <SegmentedControl
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
          value={view}
          onChange={setView}
        />
        {day && today && ws ? (
          <WeekStrip
            weekStart={ws}
            selected={day}
            today={today}
            totals={totals}
            locale={locale}
            onSelect={select}
          />
        ) : (
          <SkeletonRows rows={1} />
        )}

        {entries.error && !entries.data ? (
          <ErrorState
            compact
            error={entries.error}
            onRetry={() => void entries.refetch()}
          />
        ) : !entries.data || !day || !today ? (
          <SkeletonRows rows={4} />
        ) : view === "day" ? (
          <View>
            <SectionHeader
              title={dayHeading(day, locale, today)}
              trailing={
                <Text variant="label" tone="muted" numeric>
                  {formatDuration(totals.get(day) ?? 0)}
                </Text>
              }
            />
            {dayEntries.length === 0 ? (
              <EmptyState
                icon="clock"
                title={
                  day === today
                    ? "Nothing tracked yet today"
                    : "Nothing tracked on this day"
                }
                body="Start the timer from the button in the middle of the bar, or log time you forgot."
                action={{
                  label: "Log time",
                  icon: "plus",
                  onPress: () =>
                    router.push({
                      pathname: "/entry-edit",
                      params: { date: day },
                    }),
                }}
              />
            ) : (
              <ListGroup>
                {dayEntries.map((e) => (
                  <TimeEntryRow key={e.id} entry={e} />
                ))}
              </ListGroup>
            )}
          </View>
        ) : (
          <>
            <WeekStatusCard
              day={day}
              today={today}
              locale={locale}
              total={weekTotal}
            />
            {days.length === 0 ? (
              <EmptyState
                icon="clock"
                title="Nothing tracked this week"
                body="Time you track or log shows here, day by day."
              />
            ) : (
              days.map((d) => (
                <View key={d}>
                  <SectionHeader
                    title={dayHeading(d, locale, today)}
                    trailing={
                      <Text variant="label" tone="muted" numeric>
                        {formatDuration(totals.get(d) ?? 0)}
                      </Text>
                    }
                  />
                  <ListGroup>
                    {(byDay.get(d) ?? []).map((e) => (
                      <TimeEntryRow key={e.id} entry={e} />
                    ))}
                  </ListGroup>
                </View>
              ))
            )}
          </>
        )}
        <ReminderLink />
      </ScrollView>
      {day ? (
        <Fab
          label="Log time"
          onPress={() =>
            router.push({ pathname: "/entry-edit", params: { date: day } })
          }
          bottom={Space[4] + playerInset}
        />
      ) : null}
    </View>
  )
}

/** Approvers, with approvals on: how many weeks are waiting. */
function ApprovalsRow() {
  const canApprove = useMe().data?.permissions.includes("time.approve") ?? false
  const list = useTimesheetApprovals("submitted", canApprove)
  if (!canApprove || !list.data?.enabled) return null
  const n = list.data.pendingCount
  return (
    <ListGroup>
      <ListItem
        title="Timesheet approvals"
        subtitle={
          n === 0
            ? "Nothing waiting"
            : `${n} ${n === 1 ? "week" : "weeks"} waiting for you`
        }
        leading={<IconTile icon="checklist" tone={n ? "primary" : "neutral"} />}
        chevron
        onPress={() => router.push("/approvals")}
      />
    </ListGroup>
  )
}

/** Where the timer reminder is set (Account), with what it's set to. */
function ReminderLink() {
  const hours = useReminderSettings((s) => s.hours)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Opens Account, where the timer reminder is set"
      onPress={() => router.push("/account")}
      hitSlop={8}
    >
      <Text variant="caption" tone="muted" style={styles.center}>
        {hours
          ? `Timer reminder after ${hours} hours of running. `
          : "Timer reminder off. "}
        <Text variant="caption" tone="primary" style={{ fontWeight: "600" }}>
          Change
        </Text>
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space[4],
    paddingTop: Space[2],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  center: { textAlign: "center" },
})
