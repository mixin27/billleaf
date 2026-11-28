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
import { ScrollView, StyleSheet, View } from "react-native"

import {
  Button,
  Chip,
  confirm,
  DateField,
  EmptyState,
  Icon,
  IconTile,
  KeyboardAvoid,
  ListGroup,
  ListItem,
  SegmentedControl,
  SheetFooter,
  SheetHeader,
  SwitchRow,
  Text,
  TextField,
  TimeField,
  toast,
} from "@/components/ui"
import { Radius, Space } from "@/constants/theme"
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

/** One-tap durations, in minutes. */
const QUICK = [15, 30, 60, 120, 240, 480]
const quickLabel = (m: number) => (m < 60 ? `${m}m` : `${m / 60}h`)

/**
 * One sheet for finished time.
 *
 * - `?id=…`: edit or delete an entry from the Time list (description,
 *   project, billable, and its clock times in the workspace's time zone, or
 *   its duration when it was logged without times). Locked entries open
 *   read-only with the reason.
 * - no id (`?date=YYYY-MM-DD` optional): log new time for a day, as a
 *   duration (quickest on a phone) or a start and end.
 */
export default function EntryScreen() {
  const t = useTheme()
  const params = useLocalSearchParams<{ id?: string; date?: string }>()
  const isNew = !params.id
  const entry = useCachedEntry(params.id)
  const profile = useWorkspaceProfile()
  const tz = profile.data?.timezone ?? "UTC"
  const locale =
    profile.data?.locale ?? Intl.DateTimeFormat().resolvedOptions().locale
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
    entry?.hasTimes ? hhmm(zonedParts(entry.startedAt, tz).minutes) : "09:00"
  )
  const [to, setTo] = React.useState(() =>
    entry?.hasTimes && entry.endedAt
      ? hhmm(zonedParts(entry.endedAt, tz).minutes)
      : "10:00"
  )
  const [duration, setDuration] = React.useState(() =>
    entry && !entry.hasTimes ? formatDuration(entry.durationSeconds ?? 0) : ""
  )
  const [touched, setTouched] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setDirty(true)
      set(v)
    }

  if (!isNew && !entry) {
    return (
      <View style={[styles.flex, { backgroundColor: t.surface }]}>
        <SheetHeader title="Time entry" onClose={() => router.back()} />
        <View style={styles.content}>
          <EmptyState
            icon="clock"
            title="Entry not found"
            body="It may have been changed or deleted elsewhere."
          />
        </View>
      </View>
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
  const durationError =
    touched && !minutesValid && !hasTimes
      ? "Enter a duration, e.g. 1:30, 90m or 1.5"
      : undefined

  const save = () => {
    setTouched(true)
    if (!minutesValid || !day) return
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
    const logged = formatDuration(minutes! * 60)
    if (entry)
      update.mutate(
        { id: entry.id, ...fields },
        {
          onSuccess: () => {
            toast.success("Time saved")
            router.back()
          },
          onError: (e) => toast.error(errorMessage(e)),
        }
      )
    else
      create.mutate(fields, {
        onSuccess: () => {
          toast.success(`${logged} logged`)
          router.back()
        },
        onError: (e) => toast.error(errorMessage(e)),
      })
  }

  const askDelete = async () => {
    if (!entry) return
    const ok = await confirm({
      title: "Delete this entry?",
      message: `${formatDuration(entry.durationSeconds ?? 0)}${entry.description ? ` of “${entry.description}”` : ""} will be removed. This can't be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    remove.mutate(entry.id, {
      onSuccess: () => {
        toast.success("Entry deleted")
        router.back()
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const close = async () => {
    if (
      dirty &&
      !locked &&
      !(await confirm({
        title: isNew ? "Discard this time?" : "Discard your changes?",
        message: "What you've entered isn't saved.",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return
    router.back()
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.surface }]}>
      <SheetHeader
        title={isNew ? "Log time" : locked ? "Time entry" : "Edit time"}
        onClose={close}
      />
      <KeyboardAvoid>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {locked ? (
            <View style={[styles.notice, { backgroundColor: t.warningSoft }]}>
              <Icon name="lock" size={18} color={t.warning} />
              <Text
                variant="callout"
                style={[styles.flex, { color: t.warning }]}
              >
                {locked}
              </Text>
            </View>
          ) : null}

          <TextField
            label="What did you work on?"
            value={description}
            onChangeText={change(setDescription)}
            editable={!locked}
            maxLength={500}
            placeholder="e.g. Homepage layout"
          />

          <ListGroup>
            <ListItem
              title={projectLabel ?? "No project"}
              subtitle={
                project.clientName ??
                (projectLabel ? undefined : "Pick a project or a recent entry")
              }
              leading={
                <IconTile
                  icon="folder"
                  tone={projectLabel ? "primary" : "neutral"}
                />
              }
              chevron={!locked}
              accessibilityLabel={
                projectLabel
                  ? `Project: ${projectLabel}. Change`
                  : "Pick a project"
              }
              onPress={
                locked
                  ? undefined
                  : () => {
                      setDirty(true)
                      router.push({
                        pathname: "/project-picker",
                        params: {
                          for: "edit",
                          current: project.projectId ?? "",
                        },
                      })
                    }
              }
            />
            <SwitchRow
              title="Billable"
              subtitle={billable === null ? "Follows the project" : undefined}
              value={billable ?? true}
              onValueChange={change(setBillable)}
              disabled={Boolean(locked)}
            />
          </ListGroup>

          {isNew && today ? (
            <DateField
              label="Date"
              value={day}
              onChange={(d) => change(setDate)(d ?? today)}
              today={today}
              locale={locale}
            />
          ) : null}

          {isNew ? (
            <SegmentedControl
              options={[
                { value: "duration", label: "Duration" },
                { value: "times", label: "Start and end" },
              ]}
              value={mode}
              onChange={setMode}
            />
          ) : null}

          {hasTimes ? (
            <View style={styles.group}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  {locked ? (
                    <TextField label="Start" value={from} editable={false} />
                  ) : (
                    <TimeField
                      label="Start"
                      value={from}
                      onChange={change(setFrom)}
                      locale={locale}
                    />
                  )}
                </View>
                <View style={styles.flex}>
                  {locked ? (
                    <TextField label="End" value={to} editable={false} />
                  ) : (
                    <TimeField
                      label="End"
                      value={to}
                      onChange={change(setTo)}
                      locale={locale}
                    />
                  )}
                </View>
              </View>
              <Text
                variant="caption"
                tone={touched && !minutesValid ? "out" : "muted"}
              >
                {timedMinutes && timedMinutes > 0
                  ? `${formatDuration(timedMinutes * 60)}${end! > 1440 ? " · ends the next day" : ""} · ${tz}`
                  : `Times in ${tz}`}
              </Text>
            </View>
          ) : (
            <View style={styles.group}>
              <TextField
                label="Duration"
                icon="clock"
                value={duration}
                onChangeText={change(setDuration)}
                editable={!locked}
                keyboardType="numbers-and-punctuation"
                placeholder="1:30"
                error={durationError}
                hint={durationError ? undefined : "Hours:minutes, 90m or 1.5"}
              />
              {locked ? null : (
                <View style={styles.wrap}>
                  {QUICK.map((m) => (
                    <Chip
                      key={m}
                      label={quickLabel(m)}
                      selected={parseDuration(duration) === m}
                      onPress={() =>
                        change(setDuration)(formatDuration(m * 60))
                      }
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
        {locked ? null : (
          <SheetFooter>
            {entry ? (
              <Button
                title="Delete"
                icon="trash"
                variant="secondary"
                loading={remove.isPending}
                onPress={askDelete}
              />
            ) : null}
            <Button
              title={isNew ? "Log time" : "Save"}
              loading={create.isPending || update.isPending}
              disabled={isNew && !today}
              onPress={save}
            />
          </SheetFooter>
        )}
      </KeyboardAvoid>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Space[4], gap: Space[4], paddingBottom: Space[8] },
  notice: {
    flexDirection: "row",
    gap: Space[2],
    borderRadius: Radius.md,
    padding: Space[3],
    alignItems: "flex-start",
  },
  group: { gap: Space[2] },
  row: { flexDirection: "row", gap: Space[3], alignItems: "flex-start" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Space[2] },
})
