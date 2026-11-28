import { type Task, TASK_STATUS_LABELS } from "@workspace/contracts"
import * as React from "react"
import { Pressable, StyleSheet, View } from "react-native"

import {
  Badge,
  type BadgeTone,
  Checkbox,
  ErrorState,
  ListGroup,
  ListItem,
  SectionHeader,
  type SheetAction,
  showActions,
  SkeletonRows,
  Text,
  TextField,
  toast,
} from "@/components/ui"
import { Space } from "@/constants/theme"
import {
  useAddTask,
  useProjectTasks,
  useSetTaskStatus,
} from "@/features/projects"
import { errorMessage } from "@/lib/api"
import { shortDate } from "@/lib/format"

const ORDER = ["in_progress", "todo"] as const

const STATUS_TONE: Record<Task["status"], BadgeTone> = {
  todo: "neutral",
  in_progress: "primary",
  done: "in",
}

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
          toast.error(`Couldn't update the task. ${errorMessage(e)}`),
      }
    )

  const actionsFor = (task: Task) => {
    const actions: SheetAction[] = []
    if (canTrack && task.id !== runningTaskId)
      actions.push({
        label: "Start timer",
        icon: "play",
        onPress: () => onStart(task),
      })
    if (canEdit)
      actions.push({
        label: task.status === "done" ? "Mark not done" : "Mark done",
        icon: "check",
        onPress: () => move(task, task.status === "done" ? "todo" : "done"),
      })
    if (canEdit && task.status !== "done")
      actions.push(
        task.status === "in_progress"
          ? {
              label: "Back to To do",
              icon: "move",
              onPress: () => move(task, "todo"),
            }
          : {
              label: "Mark in progress",
              icon: "move",
              onPress: () => move(task, "in_progress"),
            }
      )
    return actions
  }

  /** The field's own text: state can trail the last keystrokes. */
  const submit = (text: string) => {
    const v = text.trim()
    if (!v || add.isPending) return
    add.mutate(v, {
      onSuccess: () => setTitle(""),
      onError: (e) => toast.error(`Couldn't add the task. ${errorMessage(e)}`),
    })
  }

  if (tasks.error && !tasks.data)
    return (
      <View>
        <SectionHeader title="Tasks" />
        <ErrorState
          compact
          error={tasks.error}
          onRetry={() => void tasks.refetch()}
        />
      </View>
    )
  if (!tasks.data)
    return (
      <View>
        <SectionHeader title="Tasks" />
        <SkeletonRows rows={2} />
      </View>
    )
  const all = tasks.data
  const open_ = ORDER.flatMap((s) => all.filter((x) => x.status === s))
  const done = all.filter((x) => x.status === "done")
  const shown = showDone ? [...open_, ...done] : open_
  if (all.length === 0 && !canEdit) return null

  return (
    <View>
      <SectionHeader
        title="Tasks"
        action={
          done.length > 0
            ? {
                label: showDone ? "Hide done" : `Show done (${done.length})`,
                onPress: () => setShowDone((v) => !v),
              }
            : undefined
        }
      />
      <ListGroup>
        {shown.map((task) => {
          const actions = actionsFor(task)
          return (
            <TaskRow
              key={task.id}
              task={task}
              locale={locale}
              today={today}
              running={task.id === runningTaskId}
              canEdit={canEdit}
              onToggle={() =>
                move(task, task.status === "done" ? "todo" : "done")
              }
              onPress={
                actions.length
                  ? () =>
                      showActions(
                        actions,
                        `${task.title} · ${TASK_STATUS_LABELS[task.status]}`
                      )
                  : undefined
              }
            />
          )
        })}
        {open_.length === 0 && !showDone ? (
          <View style={styles.empty}>
            <Text variant="callout" tone="muted">
              {all.length ? "Every task is done." : "No tasks yet."}
            </Text>
          </View>
        ) : null}
      </ListGroup>
      {canEdit ? (
        <View style={styles.add}>
          <TextField
            label="New task"
            icon="plus"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={(e) => submit(e.nativeEvent.text)}
            placeholder="Add a task"
            accessibilityLabel="Add a task"
            accessibilityHint="Type a title, then press return"
            returnKeyType="done"
            submitBehavior="submit"
            editable={!add.isPending}
            maxLength={300}
          />
        </View>
      ) : null}
    </View>
  )
}

function TaskRow({
  task,
  locale,
  today,
  running,
  canEdit,
  onToggle,
  onPress,
}: {
  task: Task
  locale: string
  today: string | undefined
  running: boolean
  canEdit: boolean
  onToggle: () => void
  onPress?: () => void
}) {
  const done = task.status === "done"
  const overdue = !done && !!task.dueDate && !!today && task.dueDate < today
  const due = task.dueDate
    ? `${overdue ? "Overdue, was due" : "Due"} ${shortDate(task.dueDate, locale, today)}`
    : null
  const sub = [running ? "Timer running" : null, task.assigneeName, due]
    .filter(Boolean)
    .join(" · ")
  const before = [running ? "Timer running" : null, task.assigneeName]
    .filter(Boolean)
    .join(" · ")
  return (
    <ListItem
      title={
        <Text
          variant="bodyStrong"
          tone={done ? "muted" : "default"}
          style={done && styles.struck}
        >
          {task.title}
        </Text>
      }
      subtitle={
        sub ? (
          <Text variant="callout" tone={running ? "primary" : "muted"}>
            {before}
            {due ? (
              <Text variant="callout" tone={overdue ? "out" : "muted"}>
                {`${before ? " · " : ""}${due}`}
              </Text>
            ) : null}
          </Text>
        ) : undefined
      }
      leading={
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: !canEdit }}
          accessibilityLabel={`Done: ${task.title}`}
          disabled={!canEdit}
          onPress={onToggle}
          hitSlop={12}
          style={!canEdit && styles.off}
        >
          <Checkbox checked={done} />
        </Pressable>
      }
      trailing={
        <Badge
          label={TASK_STATUS_LABELS[task.status]}
          tone={STATUS_TONE[task.status]}
        />
      }
      accessibilityLabel={
        onPress
          ? [task.title, TASK_STATUS_LABELS[task.status], sub]
              .filter(Boolean)
              .join(", ")
          : undefined
      }
      onPress={onPress}
    />
  )
}

const styles = StyleSheet.create({
  add: { marginTop: Space[3] },
  empty: { paddingHorizontal: Space[4] - 2, paddingVertical: Space[4] },
  struck: { textDecorationLine: "line-through" },
  off: { opacity: 0.5 },
})
