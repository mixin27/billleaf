"use client"

import { formatDuration, type Tag, type TimeEntry } from "@workspace/contracts"
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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import { useDeleteTimeEntry, useSaveTimeEntry } from "../api/mutations"
import { hhmm, parseHhmm, zonedParts, zonedToUtc } from "../zoned"
import { ProjectTaskPicker } from "./project-task-picker"
import { TagPicker } from "./tag-picker"

/** A new entry's time slot, picked by dragging on the calendar. */
export interface Slot {
  date: string
  start: number
  end: number
}

/**
 * Create (from a calendar slot) or edit an entry by its clock times, in the
 * workspace time zone. An end before the start means it ends the next day.
 */
export function CalendarEntryDialog({
  open,
  onOpenChange,
  entry,
  slot,
  tz,
  readOnly,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: TimeEntry | null
  slot?: Slot | null
  tz: string
  /** Invoiced or someone else's entry: view only. */
  readOnly?: boolean
}) {
  const save = useSaveTimeEntry()
  const remove = useDeleteTimeEntry()
  const [target, setTarget] = React.useState<{
    projectId: string | null
    taskId: string | null
  }>({ projectId: null, taskId: null })
  const [description, setDescription] = React.useState("")
  const [tags, setTags] = React.useState<Tag[]>([])
  const [date, setDate] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [billable, setBillable] = React.useState<boolean | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setConfirming(false)
    setTarget({
      projectId: entry?.projectId ?? null,
      taskId: entry?.taskId ?? null,
    })
    setDescription(entry?.description ?? "")
    setTags(entry?.tags ?? [])
    setBillable(entry ? entry.billable : null)
    if (entry) {
      const s = zonedParts(entry.startedAt, tz)
      setDate(entry.entryDate)
      if (entry.hasTimes && entry.endedAt) {
        setFrom(hhmm(s.minutes))
        setTo(hhmm(zonedParts(entry.endedAt, tz).minutes))
      } else {
        // No clock times yet: suggest 09:00 for its length.
        const mins = Math.round((entry.durationSeconds ?? 3600) / 60)
        setFrom("09:00")
        setTo(hhmm(9 * 60 + mins))
      }
    } else if (slot) {
      setDate(slot.date)
      setFrom(hhmm(slot.start))
      setTo(hhmm(slot.end))
    }
  }, [open, entry, slot, tz])

  const start = parseHhmm(from)
  const endRaw = parseHhmm(to)
  const end =
    start !== null && endRaw !== null
      ? endRaw <= start
        ? endRaw + 1440
        : endRaw
      : null
  const minutes = start !== null && end !== null ? end - start : null
  const timeError =
    from && to && minutes === null ? "Use 24-hour times, e.g. 09:30" : undefined
  const valid = Boolean(date) && minutes !== null && minutes > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || readOnly) return
    const startedAt = zonedToUtc(date, start!, tz).toISOString()
    const endedAt = zonedToUtc(date, end!, tz).toISOString()
    save.mutate(
      {
        id: entry?.id,
        projectId: target.projectId,
        taskId: target.taskId,
        description,
        tagIds: tags.map((t) => t.id),
        startedAt,
        endedAt,
        ...(billable !== null ? { billable } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            entry ? "Time updated" : `Logged ${formatDuration(minutes! * 60)}`
          )
          onOpenChange(false)
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "Time entry" : entry ? "Edit time" : "Log time"}
          </DialogTitle>
          {readOnly && entry?.invoiceId ? (
            <DialogDescription>
              On invoice {entry.invoiceNumber ?? "(draft)"}, so it can&apos;t
              change. Delete that draft invoice to free it.
            </DialogDescription>
          ) : readOnly && entry?.periodLocked ? (
            <DialogDescription>
              Time before the workspace&apos;s lock date can&apos;t change.
            </DialogDescription>
          ) : readOnly && entry?.approvalLocked ? (
            <DialogDescription>
              This week&apos;s timesheet is submitted or approved, so its time
              can&apos;t change.
            </DialogDescription>
          ) : entry && !entry.hasTimes ? (
            <DialogDescription>
              This entry was logged as a duration with no clock times. Saving
              with times places it on the calendar.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          id="calendar-entry"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <fieldset
            disabled={readOnly}
            className="contents disabled:opacity-80"
          >
            <Field
              label="What did you work on?"
              htmlFor="cal-desc"
              className="sm:col-span-2"
            >
              <Input
                id="cal-desc"
                value={description}
                maxLength={500}
                autoFocus={!entry}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <ProjectTaskPicker
              projectId={target.projectId}
              taskId={target.taskId}
              onChange={setTarget}
            />
            <Field label="Date" htmlFor="cal-date">
              <Input
                id="cal-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field
              label="Time"
              htmlFor="cal-from"
              error={timeError}
              hint={
                minutes && minutes > 0
                  ? `${formatDuration(minutes * 60)}${end! > 1440 ? " · ends the next day" : ""}`
                  : undefined
              }
            >
              <div className="flex items-center gap-1.5">
                <Input
                  id="cal-from"
                  type="time"
                  aria-label="Start time"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span aria-hidden>–</span>
                <Input
                  type="time"
                  aria-label="End time"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label>Tags</Label>
              <TagPicker
                value={tags}
                onChange={setTags}
                disabled={readOnly}
                className="w-fit"
              />
            </div>
            <Label className="flex items-center gap-2 font-normal sm:col-span-2">
              <Checkbox
                checked={billable ?? true}
                onCheckedChange={(v) => setBillable(v === true)}
              />
              Billable
              {billable === null ? (
                <span className="text-xs text-muted-foreground">
                  (follows the project)
                </span>
              ) : null}
            </Label>
          </fieldset>
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {entry && !readOnly ? (
            <Button
              type="button"
              variant={confirming ? "destructive" : "ghost"}
              disabled={remove.isPending}
              onClick={() => {
                if (!confirming) return setConfirming(true)
                remove.mutate(entry.id, {
                  onSuccess: () => {
                    toast.success("Time entry deleted")
                    onOpenChange(false)
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }}
            >
              {confirming ? "Delete for good?" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {readOnly ? null : (
              <Button
                type="submit"
                form="calendar-entry"
                disabled={!valid || save.isPending}
              >
                {entry ? "Save" : "Log time"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
