import type { TimeEntry, TimeFavorite } from "@workspace/contracts"
import { router } from "expo-router"
import * as React from "react"
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  BottomActionBar,
  Button,
  Icon,
  IconButton,
  IconTile,
  KeyboardAvoid,
  ListGroup,
  ListItem,
  SectionHeader,
  Skeleton,
  SwitchRow,
  Text,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
import { timerError, useTimerControls } from "@/features/timer-controls"
import {
  useStartFavorite,
  useTimeFavorites,
  useUpdateRunning,
} from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { MAX_CONTENT_WIDTH } from "@/lib/breakpoint"
import { formatClock } from "@/lib/clock"
import { haptic } from "@/lib/haptics"
import { useTimerDraft } from "@/stores/timer-draft"

function projectLabel(e: {
  projectName: string | null
  taskTitle: string | null
}) {
  if (!e.projectName) return null
  return [e.projectName, e.taskTitle].filter(Boolean).join(": ")
}

/**
 * The timer, full screen (a music app's "now playing"): the clock, what
 * you're working on, the project, billable and favourites, with Start or
 * Stop at the bottom. Swipe down, the chevron or Back collapses it into the
 * mini-player and the timer keeps running.
 */
export default function TimerScreen() {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const timer = useTimerControls()
  const favorites = useTimeFavorites(timer.enabled)
  const entry = timer.entry
  // An iOS page sheet already sits below the status bar.
  const top = Platform.OS === "ios" ? Space[3] : insets.top + Space[2]

  return (
    <View style={[styles.flex, { backgroundColor: t.canvas }]}>
      <View style={[styles.top, { paddingTop: top }]}>
        <IconButton
          icon="chevronDown"
          label="Collapse the timer"
          onPress={() => router.back()}
        />
        <Text
          variant="headline"
          accessibilityRole="header"
          style={styles.title}
        >
          Timer
        </Text>
        <View style={styles.topSpacer} />
      </View>
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Clock
            entry={entry}
            elapsed={timer.elapsed}
            loading={timer.loading}
          />
          {timer.loading ? null : (
            <Details key={entry?.id ?? "idle"} entry={entry} />
          )}
          {favorites.data && favorites.data.length > 0 ? (
            <Favorites items={favorites.data} running={Boolean(entry)} />
          ) : null}
        </ScrollView>
        <BottomActionBar>
          {entry ? (
            <Button
              title="Stop"
              icon="stop"
              variant="danger"
              size="lg"
              loading={timer.stopping}
              onPress={timer.stopTimer}
            />
          ) : (
            <Button
              title="Start"
              icon="play"
              size="lg"
              loading={timer.starting}
              disabled={timer.loading}
              onPress={timer.startDraft}
            />
          )}
        </BottomActionBar>
      </KeyboardAvoid>
    </View>
  )
}

function Clock({
  entry,
  elapsed,
  loading,
}: {
  entry: TimeEntry | null
  elapsed: number
  loading: boolean
}) {
  const t = useTheme()
  const locale =
    useWorkspaceProfile().data?.locale ??
    Intl.DateTimeFormat().resolvedOptions().locale
  const since = entry
    ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
        new Date(entry.startedAt)
      )
    : null
  return (
    <View style={styles.clockBox}>
      {loading ? (
        <Skeleton width={220} height={56} radius={Radius.md} />
      ) : (
        <Text
          accessibilityLabel={`Elapsed ${formatClock(elapsed)}`}
          numeric
          maxFontSizeMultiplier={1.3}
          style={[styles.clock, { color: entry ? t.text : t.textSubtle }]}
        >
          {formatClock(elapsed)}
        </Text>
      )}
      <View style={styles.status}>
        {entry ? (
          <View style={[styles.dot, { backgroundColor: t.inFill }]} />
        ) : null}
        <Text variant="callout" tone="muted">
          {loading ? " " : since ? `Running since ${since}` : "Not running"}
        </Text>
      </View>
    </View>
  )
}

/**
 * Idle: what the next timer starts with (the draft, which the project
 * picker also sets). Running: changes save to the timer straight away.
 */
function Details({ entry }: { entry: TimeEntry | null }) {
  const t = useTheme()
  const draft = useTimerDraft()
  const update = useUpdateRunning()
  const [description, setDescription] = React.useState(entry?.description ?? "")
  const [focused, setFocused] = React.useState(false)
  const project = entry ?? draft.project
  const label = projectLabel(project)
  const billable = entry ? entry.billable : (draft.billable ?? true)

  const saveDescription = () => {
    setFocused(false)
    if (entry && (entry.description ?? "") !== description)
      update.mutate(
        { description },
        { onError: timerError("Couldn't save the description") }
      )
  }
  const setBillable = (b: boolean) => {
    haptic.selection()
    if (!entry) return draft.setBillable(b)
    update.mutate(
      { billable: b },
      { onError: timerError("Couldn't change billable") }
    )
  }

  return (
    <View style={styles.details}>
      <View
        style={[
          styles.input,
          {
            backgroundColor: t.surface,
            borderColor: focused ? t.primary : t.border,
            borderWidth: focused ? 2 : 1,
          },
        ]}
      >
        <TextInput
          value={entry ? description : draft.description}
          onChangeText={entry ? setDescription : draft.setDescription}
          onFocus={() => setFocused(true)}
          onBlur={saveDescription}
          onSubmitEditing={saveDescription}
          placeholder="What are you working on?"
          placeholderTextColor={t.textSubtle}
          accessibilityLabel="What are you working on?"
          returnKeyType="done"
          maxLength={500}
          style={[styles.inputText, { color: t.text }]}
        />
      </View>
      <ListGroup>
        <ListItem
          title={label ?? "No project"}
          subtitle={
            project.clientName ??
            (label ? undefined : "Pick a project or a recent entry")
          }
          leading={
            <IconTile icon="folder" tone={label ? "primary" : "neutral"} />
          }
          chevron
          accessibilityLabel={
            label ? `Project: ${label}. Change` : "Pick a project"
          }
          onPress={() => router.push("/project-picker")}
        />
        <SwitchRow
          title="Billable"
          subtitle={
            entry || draft.billable !== null ? undefined : "Follows the project"
          }
          value={billable}
          onValueChange={setBillable}
          disabled={update.isPending}
        />
      </ListGroup>
    </View>
  )
}

/** One tap starts a favourite (and stops whatever is running). */
function Favorites({
  items,
  running,
}: {
  items: TimeFavorite[]
  running: boolean
}) {
  const start = useStartFavorite()
  return (
    <View>
      <SectionHeader title={running ? "Switch to" : "Favourites"} />
      <ListGroup>
        {items.map((f) => {
          const title = f.description || f.projectName || "Untitled"
          const sub = f.description ? projectLabel(f) : f.clientName
          return (
            <ListItem
              key={f.id}
              title={title}
              subtitle={sub ?? undefined}
              accessibilityLabel={`Start ${title}${sub ? `, ${sub}` : ""}`}
              trailing={<Icon name="play" size={20} tone="primary" />}
              onPress={
                start.isPending
                  ? undefined
                  : () => {
                      haptic.press()
                      start.mutate(f.id, {
                        onSuccess: () => toast.success(`Started ${title}`),
                        onError: timerError("Couldn't start the timer"),
                      })
                    }
              }
            />
          )
        })}
      </ListGroup>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space[2],
    paddingBottom: Space[2],
  },
  title: { flex: 1, textAlign: "center" },
  topSpacer: { width: 48 },
  content: {
    paddingHorizontal: Space[4],
    paddingBottom: Space[8],
    gap: Space[4],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  clockBox: {
    alignItems: "center",
    gap: Space[2],
    paddingVertical: Space[8],
  },
  clock: {
    fontFamily: "Inter",
    fontWeight: "600",
    fontSize: 60,
    lineHeight: 68,
    letterSpacing: -1,
  },
  status: { flexDirection: "row", alignItems: "center", gap: Space[2] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  details: { gap: Space[4] },
  input: {
    borderRadius: Radius.md,
    paddingHorizontal: Space[4],
    minHeight: 52,
    justifyContent: "center",
  },
  inputText: { fontFamily: "Inter", fontSize: 17, paddingVertical: Space[3] },
})
