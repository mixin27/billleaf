import { type Task, TASK_STATUS_LABELS } from "@workspace/contracts"
import * as React from "react"
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"

import { Body, Section, ErrorState } from "@/components/ui"
import { Radius, Spacing, Type } from "@/constants/theme"
import {
  useAddTask,
  useProjectTasks,
  useSetTaskStatus,
} from "@/features/projects"
import { useTheme } from "@/hooks/use-theme"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

const ORDER = ["in_progress", "todo"] as const

/**
 * The project's tasks: in progress first, then to do, with done ones
 * behind "Show done". Tick a task to finish it; tap it to start the timer
 * on it or move it between To do and In progress. Adding one puts it in
 * To do. Editing, assigning and reordering stay on the web.
 */
export function ProjectTasks({
  projectId,
  locale,
  today,
  canEdit,
  canTrack,
  runningTaskId,
  onStart,
}: {
  projectId: string
  locale: string
  today: string | undefined
  /** `project.update`: tick, move and add. */
  canEdit: boolean
  /** Can start a timer. */
  canTrack: boolean
  runningTaskId: string | null
  onStart: (task: Task) => void
}) {
  const t = useTheme()
  const tasks = useProjectTasks(projectId)
  const setStatus = useSetTaskStatus(projectId)
  const add = useAddTask(projectId)
  const [showDone, setShowDone] = React.useState(false)
  const [title, setTitle] = React.useState("")

  const move = (task: Task, status: Task["status"]) =>
    setStatus.mutate(
      { taskId: task.id, status },
      {
        onError: (e) =>
          Alert.alert("Couldn't update the task", errorMessage(e)),
      }
    )

  const open = (task: Task) => {
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: "Cancel", style: "cancel" },
    ]
    if (canEdit && task.status !== "done")
      buttons.push(
        task.status === "in_progress"
          ? { text: "Back to To do", onPress: () => move(task, "todo") }
          : {
              text: "Mark in progress",
              onPress: () => move(task, "in_progress"),
            }
      )
    if (canTrack && task.id !== runningTaskId)
      buttons.push({ text: "Start timer", onPress: () => onStart(task) })
    if (buttons.length === 1) return
    Alert.alert(task.title, TASK_STATUS_LABELS[task.status], buttons)
  }

  /** The field's own text: state can trail the last keystrokes. */
  const submit = (text: string) => {
    const v = text.trim()
    if (!v || add.isPending) return
    add.mutate(v, {
      onSuccess: () => setTitle(""),
      onError: (e) => Alert.alert("Couldn't add the task", errorMessage(e)),
    })
  }

  if (tasks.error && !tasks.data)
    return (
      <Section title="Tasks">
        <ErrorState
          compact
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
        />
      </Section>
    )
  if (!tasks.data) return null
  const all = tasks.data
  const open_ = ORDER.flatMap((s) => all.filter((x) => x.status === s))
  const done = all.filter((x) => x.status === "done")
  const shown = showDone ? [...open_, ...done] : open_
  if (all.length === 0 && !canEdit) return null

  return (
    <Section title="Tasks">
      {shown.map((task, i) => (
        <TaskRow
          key={task.id}
          task={task}
          first={i === 0}
          locale={locale}
          today={today}
          running={task.id === runningTaskId}
          canEdit={canEdit}
          onToggle={() => move(task, task.status === "done" ? "todo" : "done")}
          onPress={() => open(task)}
        />
      ))}
      {open_.length === 0 && !showDone ? (
        <Body
          muted
          style={[
            styles.pad,
            shown.length > 0 && styles.line,
            { borderTopColor: t.border },
          ]}
        >
          {all.length ? "Every task is done." : "No tasks yet."}
        </Body>
      ) : null}
      {done.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowDone((v) => !v)}
          style={({ pressed }) => [
            styles.pad,
            styles.line,
            { borderTopColor: t.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={[Type.body, { color: t.primary }]}>
            {showDone ? "Hide done" : `Show done (${done.length})`}
          </Text>
        </Pressable>
      ) : null}
      {canEdit ? (
        <TextInput
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={(e) => submit(e.nativeEvent.text)}
          placeholder="Add a task"
          placeholderTextColor={t.textSecondary}
          accessibilityLabel="Add a task"
          accessibilityHint="Type a title, then press return"
          returnKeyType="done"
          submitBehavior="submit"
          editable={!add.isPending}
          maxLength={300}
          style={[
            Type.body,
            styles.add,
            styles.line,
            { color: t.text, borderTopColor: t.border },
          ]}
        />
      ) : null}
    </Section>
  )
}

function TaskRow({
  task,
  first,
  locale,
  today,
  running,
  canEdit,
  onToggle,
  onPress,
}: {
  task: Task
  first: boolean
  locale: string
  today: string | undefined
  running: boolean
  canEdit: boolean
  onToggle: () => void
  onPress: () => void
}) {
  const t = useTheme()
  const done = task.status === "done"
  const overdue = !done && !!task.dueDate && !!today && task.dueDate < today
  const sub = [
    task.status === "in_progress" ? "In progress" : null,
    running ? "Timer running" : null,
    task.assigneeName,
    task.dueDate
      ? `${overdue ? "Overdue, was due" : "Due"} ${shortDate(task.dueDate, locale, today)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: t.border },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !canEdit }}
        accessibilityLabel={`Done: ${task.title}`}
        disabled={!canEdit}
        onPress={onToggle}
        hitSlop={10}
        style={[
          styles.box,
          {
            borderColor: done ? t.primary : t.textSecondary,
            backgroundColor: done ? t.primary : "transparent",
          },
        ]}
      >
        {done ? (
          <Text style={[styles.tick, { color: t.onPrimary }]}>✓</Text>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[task.title, sub].filter(Boolean).join(", ")}
        onPress={onPress}
        style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text
          style={[
            Type.body,
            {
              color: done ? t.textSecondary : t.text,
              textDecorationLine: done ? "line-through" : "none",
            },
          ]}
        >
          {task.title}
        </Text>
        {sub ? (
          <Text
            style={[
              Type.small,
              {
                color: overdue
                  ? t.danger
                  : running || task.status === "in_progress"
                    ? t.primary
                    : t.textSecondary,
              },
            ]}
          >
            {sub}
          </Text>
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.half },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  box: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: Radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: { fontSize: 14, fontWeight: "700", lineHeight: 16 },
  pad: { paddingVertical: Spacing.two + 2 },
  line: { borderTopWidth: 1 },
  add: { paddingVertical: Spacing.two + 4 },
})
