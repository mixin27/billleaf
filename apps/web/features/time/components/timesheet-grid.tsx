"use client"

import { formatDuration, type TimesheetRow } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsString, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useSetTimesheetCell, useTimesheet } from "../api/reports"
import { addDays, parseDuration, weekStart } from "../duration"
import { ProjectPopover, type ProjectLabel } from "./project-popover"

type Row = Pick<
  TimesheetRow,
  "projectId" | "projectName" | "clientName" | "taskId" | "taskTitle"
> & { seconds: number[]; lockedSeconds: number[] }

const rowKey = (r: { projectId: string | null; taskId: string | null }) =>
  `${r.projectId}|${r.taskId}`

/**
 * Clockify-style weekly timesheet: (project, task) rows × Mon–Sun. Typing a
 * duration ("1:30", "1.5", "90m") sets that cell's total; the API adds or
 * trims entries to match and never goes below invoiced time.
 */
export function TimesheetGrid({ today }: { today: string }) {
  const locale = useWorkspaceProfile().data?.locale
  const [week, setWeek] = useQueryState(
    "week",
    parseAsString.withDefault(weekStart(today))
  )
  const start = weekStart(week)
  const sheet = useTimesheet(start)
  const setCell = useSetTimesheetCell()
  const [extra, setExtra] = React.useState<Row[]>([])
  React.useEffect(() => setExtra([]), [start])

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const rows: Row[] = React.useMemo(() => {
    const fromApi = sheet.data?.rows ?? []
    const keys = new Set(fromApi.map(rowKey))
    return [...fromApi, ...extra.filter((r) => !keys.has(rowKey(r)))]
  }, [sheet.data, extra])

  const dayTotals = days.map((_, i) =>
    rows.reduce((s, r) => s + (r.seconds[i] ?? 0), 0)
  )
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0)
  const weekday = new Intl.DateTimeFormat(locale ?? "en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
  const dayNum = new Intl.DateTimeFormat(locale ?? "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })

  const save = (row: Row, dayIndex: number, seconds: number) =>
    setCell
      .mutateAsync({
        date: days[dayIndex]!,
        projectId: row.projectId,
        taskId: row.taskId,
        seconds,
      })
      .catch((e) => {
        toast.error(errorMessage(e))
        throw e
      })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous week"
          onClick={() => void setWeek(addDays(start, -7))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next week"
          onClick={() => void setWeek(addDays(start, 7))}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
        </Button>
        <span className="text-sm font-medium">
          {formatDate(start, locale)} – {formatDate(days[6]!, locale)}
        </span>
        {start !== weekStart(today) ? (
          <Button variant="ghost" size="sm" onClick={() => void setWeek(null)}>
            This week
          </Button>
        ) : null}
        <span className="ml-auto text-sm text-muted-foreground">
          Week total{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatDuration(weekTotal)}
          </span>
        </span>
      </div>

      {sheet.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : sheet.error ? (
        <p className="text-sm text-destructive">{sheet.error.message}</p>
      ) : (
        // The grid is the one place that scrolls sideways on phones.
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">
                  Project / task
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "w-20 px-1 py-2 text-center font-medium",
                      d === today && "text-foreground"
                    )}
                  >
                    <div>{weekday.format(new Date(`${d}T00:00:00Z`))}</div>
                    <div className="font-normal">
                      {dayNum.format(new Date(`${d}T00:00:00Z`))}
                    </div>
                  </th>
                ))}
                <th className="w-20 px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={rowKey(r)}>
                  <td className="max-w-64 px-3 py-1.5">
                    <p className="truncate">
                      {r.projectName ? (
                        <span className="font-medium text-primary">
                          {r.projectName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          No project
                        </span>
                      )}
                      {r.taskTitle ? `: ${r.taskTitle}` : ""}
                    </p>
                    {r.clientName ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {r.clientName}
                      </p>
                    ) : null}
                  </td>
                  {days.map((d, i) => (
                    <td key={d} className="px-1 py-1.5 text-center">
                      <DurationCell
                        seconds={r.seconds[i] ?? 0}
                        locked={r.lockedSeconds[i] ?? 0}
                        label={`${r.projectName ?? "No project"}${r.taskTitle ? `: ${r.taskTitle}` : ""}, ${d}`}
                        onSave={(s) => save(r, i, s)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {formatDuration(r.seconds.reduce((a, b) => a + b, 0))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    No time this week. Add a row, then type hours into a day.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 text-xs">
                <td className="px-3 py-2">
                  <AddRow
                    onAdd={(t, l) =>
                      setExtra((xs) => [
                        ...xs,
                        {
                          ...t,
                          ...l,
                          seconds: [0, 0, 0, 0, 0, 0, 0],
                          lockedSeconds: [0, 0, 0, 0, 0, 0, 0],
                        },
                      ])
                    }
                  />
                </td>
                {dayTotals.map((s, i) => (
                  <td
                    key={days[i]}
                    className="px-1 py-2 text-center font-medium tabular-nums"
                  >
                    {s ? formatDuration(s) : ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatDuration(weekTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function AddRow({
  onAdd,
}: {
  onAdd: (
    target: { projectId: string | null; taskId: string | null },
    label: ProjectLabel
  ) => void
}) {
  return (
    <ProjectPopover
      value={{ projectId: null, taskId: null }}
      label={{ projectName: null, clientName: null, taskTitle: null }}
      onChange={onAdd}
      trigger={
        <span className="flex items-center gap-1 text-sm">
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.8} />
          Add row
        </span>
      }
    />
  )
}

/** One editable cell: shows h:mm, accepts 1:30 / 1.5 / 90m, saves on blur. */
function DurationCell({
  seconds,
  locked,
  label,
  onSave,
}: {
  seconds: number
  locked: number
  label: string
  /** Rejects when the API refuses; the cell then shows the old value. */
  onSave: (seconds: number) => Promise<unknown>
}) {
  const shown = seconds ? formatDuration(seconds) : ""
  const [value, setValue] = React.useState(shown)
  React.useEffect(() => setValue(shown), [shown])
  const commit = () => {
    const text = value.trim()
    if (text === shown) return
    const minutes = text === "" ? 0 : parseDuration(text)
    if (minutes === null || minutes > 24 * 60) {
      toast.error("Use a duration like 1:30, 1.5 or 90m")
      setValue(shown)
      return
    }
    // Keep the seconds part when the minutes didn't change.
    if (minutes === Math.round(seconds / 60)) {
      setValue(shown)
      return
    }
    onSave(minutes * 60).catch(() => setValue(shown))
  }
  return (
    <input
      value={value}
      inputMode="decimal"
      aria-label={label}
      title={
        locked
          ? `${formatDuration(locked)} is invoiced and can't be reduced`
          : undefined
      }
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setValue(shown)
          e.currentTarget.blur()
        }
      }}
      className={cn(
        "h-8 w-16 rounded-md border border-transparent bg-transparent text-center tabular-nums outline-none hover:border-input focus:border-ring focus:ring-2 focus:ring-ring/30",
        locked > 0 && "underline decoration-dotted underline-offset-4"
      )}
    />
  )
}
