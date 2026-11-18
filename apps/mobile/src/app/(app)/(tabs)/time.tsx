import { formatDuration, type TimeEntry } from "@workspace/contracts"
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

import { Body, Button, Screen, Title } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
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
import { useElapsed } from "@/hooks/use-elapsed"
import { useTheme } from "@/hooks/use-theme"
import { ApiError, errorMessage } from "@/lib/api"
import { formatClock } from "@/lib/clock"
import { queryClient } from "@/lib/query-client"
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
  const entries = useTimeEntries(
    { from: today ?? "", to: today ?? "", memberId: "me" },
    Boolean(today)
  )
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([
      running.refetch(),
      favorites.refetch(),
      dashboard.refetch(),
      today ? entries.refetch() : null,
    ])
    setRefreshing(false)
  }

  return (
    <Screen>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <Title>Time</Title>
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
          <Today
            entries={entries.data?.items}
            total={entries.data?.totalSeconds}
            error={entries.error}
          />
        </ScrollView>
      </SafeAreaView>
    </Screen>
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

function Today({
  entries,
  total,
  error,
}: {
  entries: TimeEntry[] | undefined
  total: number | undefined
  error: unknown
}) {
  const t = useTheme()
  const resume = useContinueEntry()
  return (
    <View style={styles.section}>
      <View style={styles.todayHeader}>
        <Text style={[Type.small, styles.heading, { color: t.textSecondary }]}>
          TODAY
        </Text>
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
        <Body muted>Nothing tracked yet today.</Body>
      ) : (
        <Card style={styles.list}>
          {entries.map((e, i) => (
            <View
              key={e.id}
              style={[
                styles.entry,
                i > 0 && { borderTopWidth: 1, borderTopColor: t.border },
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
            </View>
          ))}
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
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
  todayHeader: { flexDirection: "row", justifyContent: "space-between" },
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
