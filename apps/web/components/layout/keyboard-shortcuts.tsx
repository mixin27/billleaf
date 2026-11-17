"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { create } from "zustand"

import { usePermissions } from "@/components/permissions/can"
import {
  useRunningTimer,
  useStopTimerAction,
  useTimerDialog,
} from "@/features/time"
import { useShortcut } from "@/lib/shortcuts"

/** Opens the shortcuts help (from "?" or the command menu). */
export const useShortcutsHelp = create<{
  open: boolean
  setOpen: (open: boolean) => void
}>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Anywhere",
    keys: [
      [["S"], "Start or stop the timer"],
      [["⌘", "K"], "Command menu"],
      [["D"], "Switch light / dark"],
      [["?"], "This list"],
    ],
  },
  {
    title: "Time page",
    keys: [
      [["1–9"], "Start favourite 1 to 9"],
      [["N"], "Log time (manual entry)"],
    ],
  },
  {
    title: "Calendar and timesheet",
    keys: [
      [["←", "→"], "Previous / next week (or day)"],
      [["T"], "Back to today"],
      [["W"], "Calendar: switch week / day"],
    ],
  },
]

/**
 * App-wide single-key shortcuts (S, ?) and their help dialog. Keys don't
 * fire while typing, with a modifier held, or while a dialog is open.
 */
export function KeyboardShortcuts() {
  const { can } = usePermissions()
  const canTrack = can("time.track") || can("time.manage")
  const running = useRunningTimer(canTrack)
  const { stop, pending } = useStopTimerAction()
  const openTimer = useTimerDialog((s) => s.setOpen)
  const { open, setOpen } = useShortcutsHelp()

  useShortcut(
    "s",
    () => {
      if (pending) return
      if (running.data) return stop()
      // On the Time page, type straight into the timer; elsewhere, a dialog.
      const field = document.getElementById("timer-description")
      if (field) field.focus()
      else openTimer(true)
    },
    canTrack
  )
  useShortcut("?", () => setOpen(true))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single keys work when you&apos;re not typing in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {g.title}
              </h3>
              <dl className="flex flex-col gap-1.5 text-sm">
                {g.keys.map(([keys, what]) => (
                  <div
                    key={what}
                    className="flex items-center justify-between gap-3"
                  >
                    <dt>{what}</dt>
                    <dd className="flex shrink-0 gap-1">
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-mono text-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
