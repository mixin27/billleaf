"use client"

import { formatDuration, type TimeEntry } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import { useSaveTimeEntry } from "../api/mutations"
import { parseDuration } from "../duration"
import { ProjectTaskPicker } from "./project-task-picker"

/** Log (no `entry`) or edit a finished time entry by date + duration. */
export function TimeEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultDate,
  defaultProjectId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  entry?: TimeEntry
  defaultDate: string
  defaultProjectId?: string
}) {
  const save = useSaveTimeEntry()
  const [target, setTarget] = React.useState<{
    projectId: string | null
    taskId: string | null
  }>({ projectId: null, taskId: null })
  const [date, setDate] = React.useState(defaultDate)
  const [duration, setDuration] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [billable, setBillable] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    setTarget({
      projectId: entry?.projectId ?? defaultProjectId ?? null,
      taskId: entry?.taskId ?? null,
    })
    setDate(entry?.entryDate ?? defaultDate)
    setDuration(
      entry?.durationSeconds ? formatDuration(entry.durationSeconds) : ""
    )
    setDescription(entry?.description ?? "")
    setBillable(entry?.billable ?? true)
  }, [open, entry, defaultDate, defaultProjectId])

  const minutes = parseDuration(duration)
  const durationError =
    duration && (minutes === null || minutes <= 0 || minutes > 1440)
      ? "Use e.g. 1:30, 1.5h or 90m (max 24h)"
      : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit time" : "Log time"}</DialogTitle>
        </DialogHeader>
        <form
          id="time-entry"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!target.projectId || !minutes || durationError) return
            save.mutate(
              {
                id: entry?.id,
                projectId: target.projectId,
                taskId: target.taskId,
                entryDate: date,
                durationMinutes: minutes,
                description,
                billable,
              },
              {
                onSuccess: () => {
                  toast.success(
                    entry
                      ? "Time updated"
                      : `Logged ${formatDuration(minutes * 60)}`
                  )
                  onOpenChange(false)
                },
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
          <Field label="Date" htmlFor="time-date">
            <DateInput
              id="time-date"
              value={date}
              onChange={(v) => setDate(v)}
              required
            />
          </Field>
          <Field
            label="Duration"
            htmlFor="time-duration"
            error={durationError}
            hint="1:30, 1.5h or 90m"
          >
            <Input
              id="time-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field
            label="Description"
            htmlFor="time-desc"
            className="sm:col-span-2"
          >
            <Input
              id="time-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Label className="flex items-center gap-2 font-normal sm:col-span-2">
            <Checkbox
              checked={billable}
              onCheckedChange={(c) => setBillable(Boolean(c))}
            />
            Billable
          </Label>
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
            form="time-entry"
            disabled={
              !target.projectId ||
              !minutes ||
              Boolean(durationError) ||
              save.isPending
            }
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
