import { addDays, formatDuration, type TimeEntry } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Chip,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  useMyWeek,
  useTimesheetApprovals,
  useWeekSubmission,
} from "@/features/approvals"
import { useDashboard } from "@/features/dashboard"
import { useMe } from "@/features/me"
import {
  useContinueEntry,
  useRunningTimer,
  useStartFavorite,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
  useTimeFavorites,
  useUpdateRunning,
} from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useElapsed } from "@/hooks/use-elapsed"
import { useTheme } from "@/hooks/use-theme"
import { ApiError, errorMessage } from "@/lib/api"
import { formatClock } from "@/lib/clock"
import { shortDate } from "@/lib/format"
import { queryClient } from "@/lib/query-client"
import { useReminderSettings } from "@/stores/reminder-settings"
import { useTimerDraft } from "@/stores/timer-draft"

/** Show the error; a "timer_running" race just means another device won. */
function onError(title: string) {
  return (e: unknown) => {
    if (e instanceof ApiError && e.code === "timer_running") {
      void queryClient.invalidateQueries({ queryKey: ["time"] })
      Alert.alert(title, "A timer is already running on another device.")
    } else Alert.alert(title, errorMessage(e))
  }
}

function projectLabel(e: {
  projectName: string | null
  clientName: string | null
  taskTitle: string | null
}) {
  if (!e.projectName) return null
  return [e.projectName, e.taskTitle].filter(Boolean).join(": ")
}

/** Timer, favourites and today's entries. */
export default function TimeScreen() {
  const dashboard = useDashboard()
  const today = dashboard.data?.today
  const running = useRunningTimer()
  const favorites = useTimeFavorites()
  /** The day the list shows (null = today); step back to fix older time. */
  const [picked, setPicked] = React.useState<string | null>(null)
  const day = picked ?? today
  const entries = useTimeEntries(
    { from: day ?? "", to: day ?? "", memberId: "me" },
    Boolean(day)
  )
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = async () => {
    setRefreshing(true)
    // Everything under "time" (timer, entries, favourites, the week and
    // approvals cards), plus Home's numbers.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["time"] }),
      dashboard.refetch(),
    ])
    setRefreshing(false)
  }

  return (
    <Screen>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <KeyboardAvoid>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            <Title>Time</Title>
            <ApprovalsLink />
            {running.isPending ? (
              <TimerCardShell />
            ) : (
              <TimerCard
                key={running.data?.id ?? "idle"}
                entry={running.data ?? null}
              />
            )}
            {favorites.data && favorites.data.length > 0 ? (
              <Favorites items={favorites.data} />
            ) : null}
            {day && today ? (
              <DayEntries
                day={day}
                today={today}
                onDay={(d) => setPicked(d === today ? null : d)}
                entries={entries.data?.items}
                total={entries.data?.totalSeconds}
                error={entries.error}
              />
            ) : null}
            {day && today ? <WeekCard day={day} today={today} /> : null}
            <ReminderLink />
          </ScrollView>
        </KeyboardAvoid>
      </SafeAreaView>
    </Screen>
  )
}

/**
 * Approvers, with approvals on: how many weeks are waiting, opening the
 * list. Hidden otherwise.
 */
function ApprovalsLink() {
  const t = useTheme()
  const canApprove = useMe().data?.permissions.includes("time.approve") ?? false
  const list = useTimesheetApprovals("submitted", canApprove)
  if (!canApprove || !list.data?.enabled) return null
  const n = list.data.pendingCount
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens timesheet approvals"
      onPress={() => router.push("/approvals")}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Card style={styles.approvals}>
        <View style={styles.flex}>
          <Text style={[Type.body, { color: t.text, fontWeight: "600" }]}>
            Timesheet approvals
          </Text>
          <Text style={[Type.small, { color: t.textSecondary }]}>
            {n === 0
              ? "Nothing waiting"
              : `${n} ${n === 1 ? "week" : "weeks"} waiting for you`}
          </Text>
        </View>
        <Text style={[Type.body, { color: t.primary }]}>›</Text>
      </Card>
    </Pressable>
  )
}

/**
 * With approvals on: the week the list shows, where it stands, and the
 * one thing to do next (submit, withdraw, submit again).
 */
function WeekCard({ day, today }: { day: string; today: string }) {
  const t = useTheme()
  const week = useMyWeek(day)
  const { submit, withdraw } = useWeekSubmission()
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const sheet = week.data
  if (!sheet?.approvalsEnabled) return null

  const a = sheet.approval
  const date = (iso: string) => shortDate(iso.slice(0, 10), locale, today)
  const total = sheet.rows.reduce(
    (sum, r) => sum + r.seconds.reduce((x, y) => x + y, 0),
    0
  )
  const future = sheet.weekStart > today
  const reviewer = a?.reviewedAt
    ? `${a.reviewedByName ?? "an approver"} on ${date(a.reviewedAt)}`
    : "an approver"
  const status = !a
    ? "Not submitted"
    : a.status === "submitted"
      ? "Waiting for approval"
      : a.status === "approved"
        ? "Approved"
        : "Sent back"
  const text = !a
    ? future
      ? "You can submit this week once it starts."
      : total === 0
        ? "No time in this week yet."
        : "Submit the week when it's complete. It can't change while it's waiting or approved, and only approved time is invoiced."
    : a.status === "submitted"
      ? `Submitted ${date(a.submittedAt)}. Withdraw it to make changes.`
      : a.status === "approved"
        ? `Approved by ${reviewer}. Ask an approver to reopen it if something needs to change.`
        : `Sent back by ${reviewer}. Make the changes, then submit it again.`
  const fail = (title: string) => (e: unknown) =>
    Alert.alert(title, errorMessage(e))

  return (
    <Card
      style={a?.status === "rejected" ? { borderColor: t.danger } : undefined}
    >
      <View style={styles.weekHeader}>
        <View style={styles.flex}>
          <Text style={[Type.small, { color: t.textSecondary }]}>
            {`Week of ${date(sheet.weekStart)} – ${date(addDays(sheet.weekStart, 6))}`}
          </Text>
          <Text
            style={[
              Type.body,
              styles.bold,
              {
                color:
                  a?.status === "approved"
                    ? t.primary
                    : a?.status === "rejected"
                      ? t.danger
                      : t.text,
              },
            ]}
          >
            {status}
          </Text>
        </View>
        <Text style={[Type.body, styles.bold, { color: t.text }]}>
          {formatDuration(total)}
        </Text>
      </View>
      <Body muted style={Type.small}>
        {text}
      </Body>
      {a?.note && a.status !== "submitted" ? (
        <Text style={[Type.small, { color: t.text }]}>{`“${a.note}”`}</Text>
      ) : null}
      {!a || a.status === "rejected" ? (
        <Button
          title={a ? "Submit again" : "Submit for approval"}
          loading={submit.isPending}
          disabled={future || total === 0}
          onPress={() =>
            submit.mutate(sheet.weekStart, {
              onError: fail("Couldn't submit the week"),
            })
          }
        />
      ) : a.status === "submitted" ? (
        <Button
          title="Withdraw"
          variant="secondary"
          loading={withdraw.isPending}
          onPress={() =>
            withdraw.mutate(sheet.weekStart, {
              onError: fail("Couldn't withdraw it"),
            })
          }
        />
      ) : null}
    </Card>
  )
}

/** Where the reminder is set now (Account), with what it's set to. */
function ReminderLink() {
  const t = useTheme()
  const hours = useReminderSettings((s) => s.hours)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint="Opens Account, where the timer reminder is set"
      onPress={() => router.push("/account")}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={[Type.small, { color: t.textSecondary }]}>
        {hours
          ? `Reminder after ${hours} hours of running. `
          : "Timer reminder off. "}
        <Text style={{ color: t.primary }}>Change</Text>
      </Text>
    </Pressable>
  )
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const t = useTheme()
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.backgroundElement, borderColor: t.border },
        style,
      ]}
    >
      {children}
    </View>
  )
}

function TimerCardShell() {
  return (
    <Card>
      <Body muted>Loading your timer…</Body>
    </Card>
  )
}

/**
 * Idle: what the next timer starts with (kept in the draft store so the
 * project picker can set it). Running: edits save to the timer straight away.
 */
function TimerCard({ entry }: { entry: TimeEntry | null }) {
  const t = useTheme()
  const draft = useTimerDraft()
  const start = useStartTimer()
  const stop = useStopTimer()
  const update = useUpdateRunning()
  const elapsed = useElapsed(entry?.startedAt)
  const [description, setDescription] = React.useState(entry?.description ?? "")
  const value = entry ? description : draft.description
  const label = projectLabel(entry ?? draft.project)
  const client = entry ? entry.clientName : draft.project.clientName

  const saveDescription = () => {
    if (entry && (entry.description ?? "") !== description)
      update.mutate(
        { description },
        { onError: onError("Couldn't save the description") }
      )
  }
  const startTimer = () => {
    const { description: d, project } = draft
    // Clear now: once the timer runs this card remounts, and a per-call
    // onSuccess would never fire. Put it back if starting fails.
    draft.reset()
    start.mutate(
      { description: d, projectId: project.projectId, taskId: project.taskId },
      {
        onError: (e) => {
          draft.setDescription(d)
          draft.setProject(project)
          onError("Couldn't start the timer")(e)
        },
      }
    )
  }

  return (
    <Card>
      <TextInput
        value={value}
        onChangeText={entry ? setDescription : draft.setDescription}
        onBlur={saveDescription}
        onSubmitEditing={entry ? saveDescription : startTimer}
        placeholder="What are you working on?"
        placeholderTextColor={t.textSecondary}
        accessibilityLabel="What are you working on?"
        returnKeyType={entry ? "done" : "go"}
        maxLength={500}
        style={[
          styles.description,
          {
            color: t.text,
            borderColor: t.border,
            backgroundColor: t.background,
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `Project: ${label}. Change` : "Pick a project"
        }
        onPress={() => router.push("/project-picker")}
        style={({ pressed }) => [
          styles.project,
          { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={styles.flex}>
          <Text
            style={[Type.body, { color: label ? t.primary : t.textSecondary }]}
            numberOfLines={1}
          >
            {label ?? "No project"}
          </Text>
          {client ? (
            <Text
              style={[Type.small, { color: t.textSecondary }]}
              numberOfLines={1}
            >
              {client}
            </Text>
          ) : null}
        </View>
        <Text style={[Type.small, { color: t.textSecondary }]}>
          {label ? "Change" : "Pick"}
        </Text>
      </Pressable>
      <View style={styles.timerRow}>
        <Text
          accessibilityLabel={`Elapsed ${formatClock(elapsed)}`}
          style={[styles.clock, { color: entry ? t.text : t.textSecondary }]}
        >
          {formatClock(elapsed)}
        </Text>
        <View style={styles.timerButton}>
          {entry ? (
            <Button
              title="Stop"
              variant="danger"
              loading={stop.isPending}
              onPress={() =>
                stop.mutate(undefined, {
                  onError: onError("Couldn't stop the timer"),
                })
              }
            />
          ) : (
            <Button
              title="Start"
              loading={start.isPending}
              onPress={startTimer}
            />
          )}
        </View>
      </View>
    </Card>
  )
}

/** One tap starts a pinned entry (and stops whatever is running). */
function Favorites({
  items,
}: {
  items: NonNullable<ReturnType<typeof useTimeFavorites>["data"]>
}) {
  const t = useTheme()
  const start = useStartFavorite()
  return (
    <View style={styles.section}>
      <Text style={[Type.small, styles.heading, { color: t.textSecondary }]}>
        FAVOURITES
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {items.map((f) => {
          const title = f.description || f.projectName || "Untitled"
          const sub = f.description ? projectLabel(f) : f.clientName
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Start ${title}${sub ? `, ${sub}` : ""}`}
              disabled={start.isPending}
              onPress={() =>
                start.mutate(f.id, {
                  onError: onError("Couldn't start the timer"),
                })
              }
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: t.backgroundElement,
                  borderColor: t.border,
                  opacity: pressed || start.isPending ? 0.7 : 1,
                },
              ]}
            >
              <Text
                style={[Type.body, styles.bold, { color: t.text }]}
                numberOfLines={1}
              >
                ▶ {title}
              </Text>
              {sub ? (
                <Text
                  style={[Type.small, { color: t.primary }]}
                  numberOfLines={1}
                >
                  {sub}
                </Text>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

/** "Today", "Yesterday" or "Mon, Nov 16" for a YYYY-MM-DD. */
function dayLabel(day: string, today: string, locale: string) {
  if (day === today) return "Today"
  if (day === addDays(today, -1)) return "Yesterday"
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

/** One day's entries (step back with ‹ ›), with Log time for that day. */
function DayEntries({
  day,
  today,
  onDay,
  entries,
  total,
  error,
}: {
  day: string
  today: string
  onDay: (day: string) => void
  entries: TimeEntry[] | undefined
  total: number | undefined
  error: unknown
}) {
  const t = useTheme()
  const resume = useContinueEntry()
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const label = dayLabel(day, today, locale)
  const isToday = day === today
  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? "Previous day" : "Next day"}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onDay(addDays(day, dir))}
      style={({ pressed }) => [
        styles.arrow,
        { borderColor: t.border, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[Type.body, { color: t.text }]}>{dir < 0 ? "‹" : "›"}</Text>
    </Pressable>
  )
  return (
    <View style={styles.section}>
      <View style={styles.todayHeader}>
        <View style={styles.dayNav}>
          {arrow(-1, false)}
          <Text
            accessibilityRole="header"
            style={[Type.small, styles.heading, { color: t.textSecondary }]}
          >
            {label.toUpperCase()}
          </Text>
          {arrow(1, isToday)}
        </View>
        {total !== undefined ? (
          <Text style={[Type.small, styles.bold, { color: t.textSecondary }]}>
            {formatDuration(total)}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Body>{errorMessage(error)}</Body>
      ) : !entries ? (
        <Body muted>Loading…</Body>
      ) : entries.length === 0 ? (
        <Body muted>
          {isToday
            ? "Nothing tracked yet today."
            : "Nothing tracked on this day."}
        </Body>
      ) : (
        <Card style={styles.list}>
          {entries.map((e, i) => (
            <Pressable
              key={e.id}
              // Tap to edit or delete (the running one changes in the timer).
              accessibilityRole={e.isRunning ? undefined : "button"}
              accessibilityHint={e.isRunning ? undefined : "Edit or delete"}
              disabled={e.isRunning}
              onPress={() =>
                router.push({ pathname: "/entry-edit", params: { id: e.id } })
              }
              style={({ pressed }) => [
                styles.entry,
                i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.flex}>
                <Text style={[Type.body, { color: t.text }]} numberOfLines={1}>
                  {e.description || (
                    <Text style={{ color: t.textSecondary }}>
                      No description
                    </Text>
                  )}
                </Text>
                {projectLabel(e) ? (
                  <Text
                    style={[Type.small, { color: t.primary }]}
                    numberOfLines={1}
                  >
                    {projectLabel(e)}
                  </Text>
                ) : null}
              </View>
              {e.isRunning ? (
                <Text style={[Type.small, styles.bold, { color: t.primary }]}>
                  Running
                </Text>
              ) : (
                <>
                  <Text style={[Type.body, styles.duration, { color: t.text }]}>
                    {formatDuration(e.durationSeconds ?? 0)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Continue ${e.description || "entry"}`}
                    hitSlop={8}
                    disabled={resume.isPending}
                    onPress={() =>
                      resume.mutate(e.id, {
                        onError: onError("Couldn't continue"),
                      })
                    }
                    style={({ pressed }) => [
                      styles.play,
                      { borderColor: t.border, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[Type.small, { color: t.primary }]}>▶</Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          ))}
        </Card>
      )}
      <Button
        title={isToday ? "Log time" : `Log time for ${label}`}
        variant="secondary"
        onPress={() =>
          router.push({ pathname: "/entry-edit", params: { date: day } })
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  approvals: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  bold: { fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  description: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  project: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    minHeight: 48,
  },
  timerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.three },
  clock: {
    flex: 1,
    fontSize: 36,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  timerButton: { width: 120 },
  section: { gap: Spacing.two },
  heading: { fontWeight: "600" },
  chips: { gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    maxWidth: 220,
    minHeight: 48,
    justifyContent: "center",
  },
  list: { gap: 0, paddingVertical: Spacing.one },
  dayNav: { flexDirection: "row", alignItems: "center", gap: Spacing.two },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  todayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  duration: { fontVariant: ["tabular-nums"] },
  play: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
})
