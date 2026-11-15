"use client"

import { formatDuration } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { errorMessage } from "@/lib/api"

import { useStartTimer, useStopTimer } from "../api/mutations"
import { useRunningTimer } from "../api/queries"
import { ProjectTaskPicker } from "./project-task-picker"

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt
    ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
    : 0
}

/** Start/stop the member's timer from anywhere in the app shell. */
export function TimerWidget({ compact }: { compact?: boolean }) {
  const { can } = usePermissions()
  const allowed = can("time.track") || can("time.manage")
  const running = useRunningTimer(allowed)
  const stop = useStopTimer()
  const [open, setOpen] = React.useState(false)
  const entry = running.data ?? null
  const elapsed = useElapsed(entry?.startedAt)

  if (!allowed) return null

  if (entry) {
    const s = elapsed
    const clock = `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-2 py-1",
          compact ? "text-xs" : "text-sm"
        )}
      >
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-chart-3)] opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--color-chart-3)]" />
        </span>
        <span
          className="min-w-0 flex-1 truncate"
          title={`${entry.projectName}${entry.taskTitle ? ` · ${entry.taskTitle}` : ""}`}
        >
          {entry.taskTitle ?? entry.projectName}
        </span>
        <span
          className="font-mono tabular-nums"
          aria-label={`Elapsed ${formatDuration(s)}`}
        >
          {clock}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2"
          disabled={stop.isPending}
          onClick={() =>
            stop.mutate(undefined, {
              onSuccess: (e) =>
                toast.success(
                  `Logged ${formatDuration(e.durationSeconds ?? 0)} on ${e.projectName}`
                ),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          Stop
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn(compact && "h-7 px-2 text-xs")}
        onClick={() => setOpen(true)}
      >
        ▶ Start timer
      </Button>
      <StartTimerDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function StartTimerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const start = useStartTimer()
  const [target, setTarget] = React.useState<{
    projectId: string | null
    taskId: string | null
  }>({ projectId: null, taskId: null })
  const [description, setDescription] = React.useState("")
  React.useEffect(() => {
    if (open) {
      setTarget({ projectId: null, taskId: null })
      setDescription("")
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a timer</DialogTitle>
        </DialogHeader>
        <form
          id="start-timer"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!target.projectId) return
            start.mutate(
              {
                projectId: target.projectId,
                taskId: target.taskId,
                description,
              },
              {
                onSuccess: () => onOpenChange(false),
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <ProjectTaskPicker
            projectId={target.projectId}
            taskId={target.taskId}
            onChange={setTarget}
          />
          <Field
            label="What are you working on?"
            htmlFor="timer-desc"
            hint="Optional"
          >
            <Input
              id="timer-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="start-timer"
            disabled={!target.projectId || start.isPending}
          >
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
