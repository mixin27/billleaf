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
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { PlayIcon, StopIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"
import { create } from "zustand"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"
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

/** Lets the command menu (or any button) open the start-timer dialog. */
export const useTimerDialog = create<{
  open: boolean
  setOpen: (open: boolean) => void
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

export function formatClock(s: number) {
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

/** Stop the running timer with the standard toasts. */
export function useStopTimerAction() {
  const stop = useStopTimer()
  return {
    pending: stop.isPending,
    stop: () =>
      stop.mutate(undefined, {
        onSuccess: (e) =>
          toast.success(
            `Logged ${formatDuration(e.durationSeconds ?? 0)}${e.projectName ? ` on ${e.projectName}` : ""}`
          ),
        onError: (err) => toast.error(errorMessage(err)),
      }),
  }
}

function PulseDot() {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-primary" />
    </span>
  )
}

/**
 * The member's timer in the sidebar header: "Start timer" when idle; the
 * running entry with a live clock and a stop action otherwise. Collapsed to
 * icons it shows a play button or a pulsing dot (with the clock in a tooltip).
 */
export function SidebarTimer() {
  const { can } = usePermissions()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const allowed = can("time.track") || can("time.manage")
  const running = useRunningTimer(allowed)
  const { stop, pending } = useStopTimerAction()
  const { open, setOpen } = useTimerDialog()
  const entry = running.data ?? null
  const elapsed = useElapsed(entry?.startedAt)

  if (!allowed) return null

  if (!entry) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Start timer"
            onClick={() => setOpen(true)}
          >
            <HugeiconsIcon icon={PlayIcon} strokeWidth={1.8} />
            <span>Start timer</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <StartTimerDialog open={open} onOpenChange={setOpen} />
      </SidebarMenu>
    )
  }

  const label =
    entry.description ||
    [entry.projectName, entry.taskTitle].filter(Boolean).join(" · ") ||
    "Timer running"
  const clock = formatClock(elapsed)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={`${clock} · ${label}`}
          className="bg-primary/10 hover:bg-primary/15"
          render={<Link href={`/${slug}/time`} />}
        >
          <span className="flex size-4 items-center justify-center">
            <PulseDot />
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span
            className="font-mono text-xs tabular-nums"
            aria-label={`Elapsed ${formatDuration(elapsed)}`}
          >
            {clock}
          </span>
        </SidebarMenuButton>
        <SidebarMenuAction
          title="Stop timer"
          aria-label="Stop timer"
          disabled={pending}
          onClick={stop}
          className="right-1.5"
        >
          <HugeiconsIcon icon={StopIcon} strokeWidth={2} />
        </SidebarMenuAction>
      </SidebarMenuItem>
      <StartTimerDialog open={open} onOpenChange={setOpen} />
    </SidebarMenu>
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
