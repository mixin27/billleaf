import { formatDuration, type TimeEntry } from "@workspace/contracts"
import { router } from "expo-router"

import { toast } from "@/components/ui"
import { useMe } from "@/features/me"
import {
  canTrackTime,
  useRunningTimer,
  useStartTimer,
  useStopTimer,
  useUndoStop,
} from "@/features/time"
import { useElapsed } from "@/hooks/use-elapsed"
import { ApiError, errorMessage } from "@/lib/api"
import { haptic } from "@/lib/haptics"
import { queryClient } from "@/lib/query-client"
import { useTimerDraft } from "@/stores/timer-draft"

/** A toast for a failed timer action; "timer_running" means another device won. */
export function timerError(title: string) {
  return (e: unknown) => {
    if (e instanceof ApiError && e.code === "timer_running") {
      void queryClient.invalidateQueries({ queryKey: ["time"] })
      toast.error("A timer is already running on another device.")
    } else toast.error(`${title}: ${errorMessage(e)}`)
  }
}

/**
 * The running timer and the actions the dock, the mini-player and the
 * timer screen share: start from the draft, start blank, and stop with
 * Undo.
 */
export function useTimerControls() {
  const me = useMe()
  const enabled = canTrackTime(me.data)
  const running = useRunningTimer(enabled)
  const entry = running.data ?? null
  const elapsed = useElapsed(entry?.startedAt)
  const start = useStartTimer()
  const stop = useStopTimer()
  const undo = useUndoStop()

  /** Start with what the draft holds (description and project). */
  const startDraft = () => {
    const draft = useTimerDraft.getState()
    const { description, project, billable } = draft
    haptic.press()
    // Clear now; put it back if starting fails.
    draft.reset()
    start.mutate(
      {
        description: description || undefined,
        projectId: project.projectId,
        taskId: project.taskId,
        ...(billable === null ? {} : { billable }),
      },
      {
        onError: (e) => {
          draft.setDescription(description)
          draft.setProject(project)
          draft.setBillable(billable)
          timerError("Couldn't start the timer")(e)
        },
      }
    )
  }

  /** Long-press on the dock: a blank timer now, details later. */
  const startBlank = () => {
    haptic.press()
    start.mutate(
      { projectId: null, taskId: null },
      {
        onSuccess: () =>
          toast.success("Timer started", {
            label: "Add details",
            onPress: () => router.push("/timer"),
          }),
        onError: timerError("Couldn't start the timer"),
      }
    )
  }

  const stopTimer = () => {
    haptic.press()
    stop.mutate(undefined, {
      onSuccess: (stopped) => {
        const e = stopped as TimeEntry
        toast.success(
          `Stopped · ${formatDuration(e.durationSeconds ?? 0)} logged`,
          {
            label: "Undo",
            onPress: () =>
              undo.mutate(e, { onError: timerError("Couldn't undo") }),
          }
        )
      },
      onError: timerError("Couldn't stop the timer"),
    })
  }

  return {
    enabled,
    loading: running.isPending && enabled,
    entry,
    elapsed,
    starting: start.isPending,
    stopping: stop.isPending,
    startDraft,
    startBlank,
    stopTimer,
  }
}
