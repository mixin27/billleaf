"use client"

import {
  fromMinorUnits,
  type Task,
  TASK_STATUS_LABELS,
  type TaskStatus,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useMembers } from "@/features/members"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useCreateTask, useDeleteTask, useUpdateTask } from "../api/mutations"
import { useTasks } from "../api/queries"

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"]

/** Hourly projects can price a task differently from the project. */
type Pricing = { currency: string } | null

/** Three-column task board (to do / in progress / done) with optimistic updates. */
export function TaskBoard({
  projectId,
  locale,
  today,
  pricing = null,
}: {
  projectId: string
  locale?: string
  today?: string
  /** Set for hourly projects: tasks can have their own hourly rate. */
  pricing?: Pricing
}) {
  const [pricingTask, setPricingTask] = React.useState<Task | null>(null)
  const tasks = useTasks(projectId)
  const { can } = usePermissions()
  const editable = can("project.update")
  const members = useMembers()
  const memberOptions = can("member.read") ? (members.data ?? []) : []

  if (tasks.isPending) return <Skeleton className="h-48 w-full" />
  if (tasks.error)
    return <p className="text-sm text-destructive">{tasks.error.message}</p>

  const byStatus = (s: TaskStatus) =>
    tasks.data
      .filter((t) => t.status === s)
      .sort((a, b) => a.position - b.position)

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((status) => {
        const column = byStatus(status)
        return (
          <section
            key={status}
            className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3"
            aria-label={TASK_STATUS_LABELS[status]}
          >
            <h3 className="flex items-center justify-between text-xs font-medium text-muted-foreground uppercase">
              {TASK_STATUS_LABELS[status]}
              <span className="tabular-nums">{column.length}</span>
            </h3>
            {column.map((task, i) => (
              <TaskCard
                key={task.id}
                task={task}
                projectId={projectId}
                above={column[i - 1]}
                below={column[i + 1]}
                aboveAbove={column[i - 2]}
                editable={editable}
                members={memberOptions}
                locale={locale}
                today={today}
                pricing={pricing}
                onSetRate={() => setPricingTask(task)}
              />
            ))}
            {editable ? (
              <QuickAdd projectId={projectId} status={status} />
            ) : null}
          </section>
        )
      })}
      {pricing ? (
        <TaskRateDialog
          task={pricingTask}
          projectId={projectId}
          currency={pricing.currency}
          onClose={() => setPricingTask(null)}
        />
      ) : null}
    </div>
  )
}

function TaskRateDialog({
  task,
  projectId,
  currency,
  onClose,
}: {
  task: Task | null
  projectId: string
  currency: string
  onClose: () => void
}) {
  const update = useUpdateTask(projectId)
  const [value, setValue] = React.useState("")
  React.useEffect(() => {
    if (task)
      setValue(
        task.hourlyRate === null
          ? ""
          : fromMinorUnits(task.hourlyRate, currency)
      )
  }, [task, currency])
  const minor = value.trim() ? toMinorUnits(value, currency) : null
  const invalid = Boolean(value.trim()) && (minor === null || minor < 0)
  return (
    <Dialog open={task !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hourly rate for this task</DialogTitle>
          <DialogDescription>
            Time on “{task?.title}” is billed at this rate instead of the
            project&apos;s or member&apos;s. Leave empty to use those.
          </DialogDescription>
        </DialogHeader>
        <form
          id="task-rate"
          onSubmit={(e) => {
            e.preventDefault()
            if (!task || invalid) return
            update.mutate(
              { taskId: task.id, hourlyRate: minor },
              {
                onSuccess: () => {
                  toast.success("Task rate saved")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field
            label={`Per hour (${currency})`}
            htmlFor="task-rate-input"
            error={invalid ? "Enter a valid amount" : undefined}
          >
            <Input
              id="task-rate-input"
              inputMode="decimal"
              className="w-40"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="task-rate"
            disabled={update.isPending || invalid}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TaskCard({
  task,
  projectId,
  above,
  aboveAbove,
  below,
  editable,
  members,
  locale,
  today,
  pricing,
  onSetRate,
}: {
  task: Task
  projectId: string
  above?: Task
  aboveAbove?: Task
  below?: Task
  editable: boolean
  members: { id: string; name: string }[]
  locale?: string
  today?: string
  pricing: Pricing
  onSetRate: () => void
}) {
  const update = useUpdateTask(projectId)
  const remove = useDeleteTask(projectId)
  const fail = (e: unknown) => toast.error(errorMessage(e))
  const done = task.status === "done"
  const late = !done && task.dueDate && today && task.dueDate < today

  return (
    <div className="flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm shadow-xs">
      <Checkbox
        aria-label={done ? "Mark as not done" : "Mark as done"}
        checked={done}
        disabled={!editable}
        className="mt-0.5"
        onCheckedChange={(c) =>
          update.mutate(
            { taskId: task.id, status: c ? "done" : "todo" },
            { onError: fail }
          )
        }
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "break-words",
            done && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </p>
        {task.assigneeName ||
        task.dueDate ||
        (pricing && task.hourlyRate !== null) ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              task.assigneeName,
              task.dueDate ? (
                <span key="due" className={cn(late && "text-destructive")}>
                  due {formatDate(task.dueDate, locale)}
                </span>
              ) : null,
              pricing && task.hourlyRate !== null
                ? `${money(task.hourlyRate, pricing.currency, locale)} / h`
                : null,
            ]
              .filter(Boolean)
              .flatMap((x, i) => (i === 0 ? [x] : [" · ", x]))}
          </p>
        ) : null}
      </div>
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="ghost" aria-label="Task actions">
                ⋯
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!above}
              onClick={() =>
                update.mutate(
                  { taskId: task.id, afterTaskId: aboveAbove?.id ?? null },
                  { onError: fail }
                )
              }
            >
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!below}
              onClick={() =>
                update.mutate(
                  { taskId: task.id, afterTaskId: below!.id },
                  { onError: fail }
                )
              }
            >
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {COLUMNS.filter((s) => s !== task.status).map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() =>
                  update.mutate(
                    { taskId: task.id, status: s },
                    { onError: fail }
                  )
                }
              >
                Move to {TASK_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
            {members.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                  {members.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onClick={() =>
                        update.mutate(
                          { taskId: task.id, assigneeMemberId: m.id },
                          { onError: fail }
                        )
                      }
                    >
                      {m.name}
                      {task.assigneeMemberId === m.id ? " ✓" : ""}
                    </DropdownMenuItem>
                  ))}
                  {task.assigneeMemberId ? (
                    <DropdownMenuItem
                      onClick={() =>
                        update.mutate(
                          { taskId: task.id, assigneeMemberId: null },
                          { onError: fail }
                        )
                      }
                    >
                      Unassign
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </>
            ) : null}
            {pricing ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSetRate}>
                  {task.hourlyRate === null
                    ? "Set hourly rate…"
                    : "Change hourly rate…"}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => remove.mutate(task.id, { onError: fail })}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

function QuickAdd({
  projectId,
  status,
}: {
  projectId: string
  status: TaskStatus
}) {
  const create = useCreateTask(projectId)
  const [title, setTitle] = React.useState("")
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        create.mutate(
          { title: title.trim(), status },
          {
            onSuccess: () => setTitle(""),
            onError: (err) => toast.error(errorMessage(err)),
          }
        )
      }}
    >
      <Input
        aria-label={`Add a task to ${TASK_STATUS_LABELS[status]}`}
        placeholder="+ Add task"
        value={title}
        disabled={create.isPending}
        onChange={(e) => setTitle(e.target.value)}
        className="bg-transparent"
      />
    </form>
  )
}
