import {
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
  Field,
  KeyboardAvoid,
  Screen,
  Title,
} from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  entryLockReason,
  useCachedEntry,
  useDeleteTimeEntry,
  useUpdateTimeEntry,
} from "@/features/time"
import { useWorkspaceProfile } from "@/features/workspaces"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { useEditDraft } from "@/stores/timer-draft"

/**
 * Edit or delete a finished entry from Today: description, project,
 * billable, and its clock times (in the workspace's time zone) or, for an
 * entry logged as a duration, the duration. Locked entries open read-only.
 */
export default function EditEntryScreen() {
  const t = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const entry = useCachedEntry(id)
  const tz = useWorkspaceProfile().data?.timezone ?? "UTC"
  const update = useUpdateTimeEntry()
  const remove = useDeleteTimeEntry()
  const picked = useEditDraft((s) => s.project)
  const setPicked = useEditDraft((s) => s.setProject)

  // Start from what's saved; forget a project picked for another entry.
  React.useEffect(() => setPicked(null), [id, setPicked])

  const [description, setDescription] = React.useState(entry?.description ?? "")
  const [billable, setBillable] = React.useState(entry?.billable ?? true)
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

  if (!entry) {
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

  const locked = entryLockReason(entry)
  const project = picked ?? entry
  const projectLabel = project.projectName
    ? [project.projectName, project.taskTitle].filter(Boolean).join(": ")
    : null

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
  const durationMinutes = entry.hasTimes ? null : parseDuration(duration)
  const minutes = entry.hasTimes ? timedMinutes : durationMinutes
  const timeError =
    touched && (minutes === null || minutes <= 0 || minutes > 1440)
      ? entry.hasTimes
        ? "Use 24-hour times, e.g. 09:30"
        : "Enter a duration, e.g. 1:30"
      : undefined

  const save = () => {
    setTouched(true)
    if (minutes === null || minutes <= 0 || minutes > 1440) return
    const times = entry.hasTimes
      ? {
          startedAt: zonedToUtc(entry.entryDate, start!, tz).toISOString(),
          endedAt: zonedToUtc(entry.entryDate, end!, tz).toISOString(),
        }
      : { durationMinutes: minutes }
    update.mutate(
      {
        id: entry.id,
        description,
        projectId: project.projectId,
        taskId: project.taskId,
        billable,
        ...times,
      },
      {
        onSuccess: () => router.back(),
        onError: (e) => Alert.alert("Couldn't save", errorMessage(e)),
      }
    )
  }

  const confirmDelete = () =>
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
              onError: (e) => Alert.alert("Couldn't delete", errorMessage(e)),
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
            <Title>{locked ? "Time entry" : "Edit time"}</Title>
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
                    Change
                  </Text>
                )}
              </Pressable>
            </View>

            {entry.hasTimes ? (
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
                checked: billable,
                disabled: Boolean(locked),
              }}
              accessibilityLabel="Billable"
              disabled={Boolean(locked)}
              onPress={() => setBillable((b) => !b)}
              style={[styles.switchRow, { borderColor: t.border }]}
            >
              <Text style={[Type.body, { color: t.text }]}>Billable</Text>
              <Switch
                value={billable}
                onValueChange={setBillable}
                disabled={Boolean(locked)}
                trackColor={{ true: t.primary }}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              />
            </Pressable>

            {locked ? null : (
              <>
                <Button
                  title="Save"
                  loading={update.isPending}
                  onPress={save}
                />
                <Button
                  title="Delete entry"
                  variant="secondary"
                  disabled={remove.isPending}
                  onPress={confirmDelete}
                />
              </>
            )}
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
