import {
  addDays,
  formatDuration,
  hhmm,
  parseDuration,
  parseHhmm,
  zonedParts,
  zonedToUtc,
} from "@workspace/contracts"
import { router, useLocalSearchParams } from "expo-router"
import * as React from "react"
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import {
  Body,
  Button,
  Chip,
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import { useDashboard } from "@/features/dashboard"
import {
  entryLockReason,
  useCachedEntry,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
} from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { NO_PROJECT, useEditDraft } from "@/stores/timer-draft"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One sheet for finished time.
 *
 * - `?id=…`: edit or delete an entry from the Time list (description,
 *   project, billable, and its clock times in the workspace's time zone, or
 *   its duration when it was logged without times). Locked entries open
 *   read-only.
 * - no id (`?date=YYYY-MM-DD` optional): log new time for a day, as a
 *   duration (quickest on a phone) or a start and end.
 */
export default function EntryScreen() {
  const t = useTheme()
  const params = useLocalSearchParams<{ id?: string; date?: string }>()
  const isNew = !params.id
  const entry = useCachedEntry(params.id)
  const tz = useWorkspaceProfile().data?.timezone ?? "UTC"
  const today = useDashboard().data?.today
  const create = useCreateTimeEntry()
  const update = useUpdateTimeEntry()
  const remove = useDeleteTimeEntry()
  const picked = useEditDraft((s) => s.project)
  const setPicked = useEditDraft((s) => s.setProject)

  // Start from what's saved; forget a project picked for another entry.
  React.useEffect(() => setPicked(null), [params.id, setPicked])

  const [description, setDescription] = React.useState(entry?.description ?? "")
  /** Null = follow the project's billing (new entries only). */
  const [billable, setBillable] = React.useState<boolean | null>(
    entry ? entry.billable : null
  )
  /** How new time is entered; an existing entry keeps its kind. */
  const [mode, setMode] = React.useState<"duration" | "times">("duration")
  const [date, setDate] = React.useState<string | null>(params.date ?? null)
  const [from, setFrom] = React.useState(() =>
    entry?.hasTimes ? hhmm(zonedParts(entry.startedAt, tz).minutes) : ""
  )
  const [to, setTo] = React.useState(() =>
    entry?.hasTimes && entry.endedAt
      ? hhmm(zonedParts(entry.endedAt, tz).minutes)
      : ""
  )
  const [duration, setDuration] = React.useState(() =>
    entry && !entry.hasTimes ? formatDuration(entry.durationSeconds ?? 0) : ""
  )
  const [touched, setTouched] = React.useState(false)

  if (!isNew && !entry) {
    return (
      <Screen>
        <SafeAreaView style={styles.flex}>
          <View style={styles.missing}>
            <Title>Entry not found</Title>
            <Body muted>It may have been changed or deleted elsewhere.</Body>
            <Button title="Close" onPress={() => router.back()} />
          </View>
        </SafeAreaView>
      </Screen>
    )
  }

  const locked = entry ? entryLockReason(entry) : null
  const project = picked ?? entry ?? NO_PROJECT
  const projectLabel = project.projectName
    ? [project.projectName, project.taskTitle].filter(Boolean).join(": ")
    : null
  const day = entry?.entryDate ?? date ?? today ?? ""
  const hasTimes = entry ? entry.hasTimes : mode === "times"

  // Clock times: an end at or before the start means it ends the next day.
  const start = parseHhmm(from)
  const endRaw = parseHhmm(to)
  const end =
    start !== null && endRaw !== null
      ? endRaw <= start
        ? endRaw + 1440
        : endRaw
      : null
  const timedMinutes = start !== null && end !== null ? end - start : null
  const minutes = hasTimes ? timedMinutes : parseDuration(duration)
  const minutesValid = minutes !== null && minutes > 0 && minutes <= 1440
  const timeError =
    touched && !minutesValid
      ? hasTimes
        ? "Use 24-hour times, e.g. 09:30"
        : "Enter a duration, e.g. 1:30 or 45m"
      : undefined
  const dateError =
    touched && !ISO_DATE.test(day) ? "Use YYYY-MM-DD" : undefined

  const onError = (title: string) => (e: unknown) =>
    Alert.alert(title, errorMessage(e))

  const save = () => {
    setTouched(true)
    if (!minutesValid || !ISO_DATE.test(day)) return
    const times = hasTimes
      ? {
          startedAt: zonedToUtc(day, start!, tz).toISOString(),
          endedAt: zonedToUtc(day, end!, tz).toISOString(),
        }
      : entry
        ? { durationMinutes: minutes! }
        : { entryDate: day, durationMinutes: minutes! }
    const fields = {
      description,
      projectId: project.projectId,
      taskId: project.taskId,
      ...(billable !== null ? { billable } : {}),
      ...times,
    }
    if (entry)
      update.mutate(
        { id: entry.id, ...fields },
        { onSuccess: () => router.back(), onError: onError("Couldn't save") }
      )
    else
      create.mutate(fields, {
        onSuccess: () => router.back(),
        onError: onError("Couldn't log the time"),
      })
  }

  const confirmDelete = () =>
    entry &&
    Alert.alert(
      "Delete this entry?",
      `${formatDuration(entry.durationSeconds ?? 0)}${entry.description ? ` of “${entry.description}”` : ""} will be removed. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            remove.mutate(entry.id, {
              onSuccess: () => router.back(),
              onError: onError("Couldn't delete"),
            }),
        },
      ]
    )

  return (
    <Screen>
      {/* An iOS sheet leaves room at the top; Android shows it full screen. */}
      <SafeAreaView
        style={styles.flex}
        edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]}
      >
        <KeyboardAvoid>
          <View style={styles.header}>
            <Title>
              {isNew ? "Log time" : locked ? "Time entry" : "Edit time"}
            </Title>
            <Button
              title={locked ? "Close" : "Cancel"}
              variant="link"
              onPress={() => router.back()}
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {locked ? (
              <View
                style={[
                  styles.notice,
                  {
                    backgroundColor: t.backgroundElement,
                    borderColor: t.border,
                  },
                ]}
              >
                <Body muted>{locked}</Body>
              </View>
            ) : null}

            <Field
              label="What did you work on?"
              value={description}
              onChangeText={setDescription}
              editable={!locked}
              maxLength={500}
            />

            <View style={styles.gap}>
              <Text style={[Type.small, styles.label, { color: t.text }]}>
                Project
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  projectLabel
                    ? `Project: ${projectLabel}. Change`
                    : "Pick a project"
                }
                disabled={Boolean(locked)}
                onPress={() =>
                  router.push({
                    pathname: "/project-picker",
                    params: { for: "edit", current: project.projectId ?? "" },
                  })
                }
                style={({ pressed }) => [
                  styles.project,
                  { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={styles.flex}>
                  <Text
                    style={[
                      Type.body,
                      { color: projectLabel ? t.primary : t.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {projectLabel ?? "No project"}
                  </Text>
                  {project.clientName ? (
                    <Text
                      style={[Type.small, { color: t.textSecondary }]}
                      numberOfLines={1}
                    >
                      {project.clientName}
                    </Text>
                  ) : null}
                </View>
                {locked ? null : (
                  <Text style={[Type.small, { color: t.textSecondary }]}>
                    {projectLabel ? "Change" : "Pick"}
                  </Text>
                )}
              </Pressable>
            </View>

            {isNew ? (
              <View style={styles.gap}>
                <Field
                  label="Date"
                  value={day}
                  onChangeText={setDate}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                  maxLength={10}
                  error={dateError}
                />
                {today ? (
                  <View style={styles.chips}>
                    {(
                      [
                        ["Today", today],
                        ["Yesterday", addDays(today, -1)],
                      ] as const
                    ).map(([label, value]) => (
                      <Chip
                        key={label}
                        label={label}
                        selected={day === value}
                        onPress={() => setDate(value)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {isNew ? (
              <View style={styles.chips}>
                <Chip
                  label="Duration"
                  selected={mode === "duration"}
                  onPress={() => setMode("duration")}
                />
                <Chip
                  label="Start and end"
                  selected={mode === "times"}
                  onPress={() => setMode("times")}
                />
              </View>
            ) : null}

            {hasTimes ? (
              <View style={styles.gap}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Field
                      label="Start"
                      value={from}
                      onChangeText={setFrom}
                      editable={!locked}
                      keyboardType="numbers-and-punctuation"
                      placeholder="09:00"
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Field
                      label="End"
                      value={to}
                      onChangeText={setTo}
                      editable={!locked}
                      keyboardType="numbers-and-punctuation"
                      placeholder="17:00"
                      maxLength={5}
                    />
                  </View>
                </View>
                <Text
                  style={[
                    Type.small,
                    { color: timeError ? t.danger : t.textSecondary },
                  ]}
                >
                  {timeError ??
                    (timedMinutes && timedMinutes > 0
                      ? `${formatDuration(timedMinutes * 60)}${end! > 1440 ? " · ends the next day" : ""} · ${tz}`
                      : `24-hour times, ${tz}`)}
                </Text>
              </View>
            ) : (
              <Field
                label="Duration"
                value={duration}
                onChangeText={setDuration}
                editable={!locked}
                keyboardType="numbers-and-punctuation"
                placeholder="1:30"
                error={timeError}
              />
            )}

            {/* The whole row toggles: a bigger target than the switch. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{
                checked: billable ?? true,
                disabled: Boolean(locked),
              }}
              accessibilityLabel="Billable"
              disabled={Boolean(locked)}
              onPress={() => setBillable((b) => !(b ?? true))}
              style={[styles.switchRow, { borderColor: t.border }]}
            >
              <View>
                <Text style={[Type.body, { color: t.text }]}>Billable</Text>
                {billable === null ? (
                  <Text style={[Type.small, { color: t.textSecondary }]}>
                    Follows the project
                  </Text>
                ) : null}
              </View>
              <Switch
                value={billable ?? true}
                onValueChange={setBillable}
                disabled={Boolean(locked)}
                trackColor={{ true: t.primary, false: t.borderStrong }}
                thumbColor={t.surface}
                ios_backgroundColor={t.borderStrong}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              />
            </Pressable>

            {locked ? null : (
              <Button
                title={isNew ? "Log time" : "Save"}
                loading={create.isPending || update.isPending}
                disabled={isNew && !today}
                onPress={save}
              />
            )}
            {entry && !locked ? (
              <Button
                title="Delete entry"
                variant="secondary"
                disabled={remove.isPending}
                onPress={confirmDelete}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoid>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  content: { padding: Spacing.four, gap: Spacing.four },
  missing: { padding: Spacing.four, gap: Spacing.three },
  notice: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  gap: { gap: Spacing.two },
  label: { fontWeight: "600" },
  row: { flexDirection: "row", gap: Spacing.three },
  chips: { flexDirection: "row", gap: Spacing.two },
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: Spacing.two,
  },
})
