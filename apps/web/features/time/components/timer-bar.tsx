"use client"

import {
  formatDuration,
  type Tag,
  type TimeEntry,
  type TimeSuggestion,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  Clock01Icon,
  DollarCircleIcon,
  ListViewIcon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { errorMessage } from "@/lib/api"

import { useCreateFavorite } from "../api/favorites"
import {
  useSaveTimeEntry,
  useStartTimer,
  useUpdateRunning,
} from "../api/mutations"
import { useRunningTimer, useTimeSuggestions } from "../api/queries"
import { parseDuration } from "../duration"
import {
  ProjectPopover,
  type ProjectLabel,
  type ProjectTarget,
} from "./project-popover"
import { TagPicker } from "./tag-picker"
import { TagChip } from "./tag-chip"
import { formatClock, useElapsed, useStopTimerAction } from "./timer-widget"

const EMPTY_LABEL: ProjectLabel = {
  projectName: null,
  clientName: null,
  taskTitle: null,
}

/** Local "YYYY-MM-DD" + "HH:MM" → ISO instant in the browser's time zone. */
function localIso(date: string, time: string, addDays = 0) {
  const d = new Date(`${date}T${time}`)
  d.setDate(d.getDate() + addDays)
  return d.toISOString()
}

/**
 * The tracker's top bar: "What are you working on?" with autocomplete,
 * project/task, tags, billable and Start/Stop. While a timer runs, every
 * change is saved to it straight away. Manual mode logs a finished entry.
 */
export function TimerBar({ today }: { today: string }) {
  const running = useRunningTimer()
  const entry = running.data ?? null
  const [mode, setMode] = React.useState<"timer" | "manual">("timer")

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-2 shadow-xs sm:flex-row sm:items-center",
        // Manual mode has more controls: put them under the description
        // until there's room for one line.
        mode === "manual" &&
          !entry &&
          "sm:flex-col sm:items-stretch xl:flex-row xl:items-center"
      )}
    >
      {mode === "timer" || entry ? (
        <TimerFields key={entry?.id ?? "idle"} entry={entry} />
      ) : (
        <ManualFields today={today} />
      )}
      {entry ? null : (
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 self-end",
            mode === "manual"
              ? "xl:flex-col xl:self-center"
              : "sm:flex-col sm:self-center"
          )}
        >
          <ModeButton
            active={mode === "timer"}
            label="Timer mode"
            icon={Clock01Icon}
            onClick={() => setMode("timer")}
          />
          <ModeButton
            active={mode === "manual"}
            label="Manual mode"
            icon={ListViewIcon}
            onClick={() => setMode("manual")}
          />
        </div>
      )}
    </div>
  )
}

function ModeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: typeof Clock01Icon
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground",
              active && "bg-muted text-foreground"
            )}
          />
        }
      >
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.8} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Billable "$" toggle, shared by the bar and entry rows. */
export function BillableToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label="Billable"
      aria-pressed={value}
      title={value ? "Billable" : "Non-billable"}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
        value ? "text-primary" : "text-muted-foreground/60"
      )}
    >
      <HugeiconsIcon icon={DollarCircleIcon} size={18} strokeWidth={1.8} />
    </button>
  )
}

function useTimerFieldState(entry: TimeEntry | null) {
  const [description, setDescription] = React.useState(entry?.description ?? "")
  const [target, setTarget] = React.useState<ProjectTarget>({
    projectId: entry?.projectId ?? null,
    taskId: entry?.taskId ?? null,
  })
  const [label, setLabel] = React.useState<ProjectLabel>(
    entry
      ? {
          projectName: entry.projectName,
          clientName: entry.clientName,
          taskTitle: entry.taskTitle,
        }
      : EMPTY_LABEL
  )
  const [tags, setTags] = React.useState<Tag[]>(entry?.tags ?? [])
  /** null = let the project decide (idle only). */
  const [billable, setBillable] = React.useState<boolean | null>(
    entry ? entry.billable : null
  )
  return {
    description,
    setDescription,
    target,
    setTarget,
    label,
    setLabel,
    tags,
    setTags,
    billable,
    setBillable,
  }
}

function TimerFields({ entry }: { entry: TimeEntry | null }) {
  const s = useTimerFieldState(entry)
  const start = useStartTimer()
  const update = useUpdateRunning()
  const { stop, pending: stopping } = useStopTimerAction()
  const elapsed = useElapsed(entry?.startedAt)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pin = useCreateFavorite()
  const canPin = Boolean(s.description.trim() || s.target.projectId)

  const onError = (err: unknown) => toast.error(errorMessage(err))
  /** While running, save each change to the timer immediately. */
  const save = (body: Parameters<typeof update.mutate>[0]) => {
    if (entry) update.mutate(body, { onError })
  }

  const startTimer = (override?: Partial<TimeSuggestion>) => {
    const projectId =
      override?.projectId !== undefined
        ? override.projectId
        : s.target.projectId
    start.mutate(
      {
        description: override?.description ?? s.description,
        projectId,
        taskId:
          override?.taskId !== undefined ? override.taskId : s.target.taskId,
        tagIds: (override?.tags ?? s.tags).map((t) => t.id),
        ...(override?.billable !== undefined
          ? { billable: override.billable }
          : s.billable !== null
            ? { billable: s.billable }
            : {}),
      },
      { onError }
    )
  }

  const applySuggestion = (x: TimeSuggestion) => {
    s.setDescription(x.description)
    s.setTarget({ projectId: x.projectId, taskId: x.taskId })
    s.setLabel({
      projectName: x.projectName,
      clientName: x.clientName,
      taskTitle: x.taskTitle,
    })
    s.setTags(x.tags)
    s.setBillable(x.billable)
    if (entry)
      save({
        description: x.description,
        projectId: x.projectId,
        taskId: x.taskId,
        tagIds: x.tags.map((t) => t.id),
        billable: x.billable,
      })
  }

  return (
    <>
      <DescriptionInput
        inputRef={inputRef}
        value={s.description}
        onChange={s.setDescription}
        onPick={applySuggestion}
        onCommit={() => {
          if (entry) {
            if ((entry.description ?? "") !== s.description)
              save({ description: s.description })
          } else startTimer()
        }}
        onBlur={() => {
          if (entry && (entry.description ?? "") !== s.description)
            save({ description: s.description })
        }}
      />
      <div className="flex min-w-0 items-center gap-1">
        <ProjectPopover
          value={s.target}
          label={s.label}
          compact
          className="min-w-0 shrink"
          onChange={(t, l) => {
            s.setTarget(t)
            s.setLabel(l)
            save({ projectId: t.projectId, taskId: t.taskId })
          }}
        />
        <TagPicker
          value={s.tags}
          compact
          onChange={(tags) => {
            s.setTags(tags)
            save({ tagIds: tags.map((t) => t.id) })
          }}
        />
        <BillableToggle
          value={s.billable ?? true}
          onChange={(v) => {
            s.setBillable(v)
            save({ billable: v })
          }}
        />
        <button
          type="button"
          aria-label="Add to favourites"
          title={
            canPin
              ? "Add to favourites"
              : "Type a description or pick a project to pin it"
          }
          disabled={!canPin || pin.isPending}
          onClick={() =>
            pin.mutate(
              {
                description: s.description,
                projectId: s.target.projectId,
                taskId: s.target.taskId,
                tagIds: s.tags.map((t) => t.id),
                billable: s.billable,
              },
              {
                onSuccess: () => toast.success("Added to favourites"),
                onError,
              }
            )
          }
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <HugeiconsIcon icon={StarIcon} size={17} strokeWidth={1.8} />
        </button>
        <span
          className={cn(
            "ml-auto w-20 text-right font-mono text-base tabular-nums sm:ml-2",
            !entry && "text-muted-foreground"
          )}
          aria-live="off"
        >
          {formatClock(elapsed)}
        </span>
        {entry ? (
          <Button
            variant="destructive"
            className="ml-1 w-20"
            disabled={stopping}
            onClick={stop}
          >
            Stop
          </Button>
        ) : (
          <Button
            className="ml-1 w-20"
            disabled={start.isPending}
            onClick={() => startTimer()}
          >
            Start
          </Button>
        )}
      </div>
    </>
  )
}

/** Description field with a dropdown of recent entries (↑↓ Enter Esc). */
function DescriptionInput({
  value,
  onChange,
  onPick,
  onCommit,
  onBlur,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  onPick: (s: TimeSuggestion) => void
  onCommit: () => void
  onBlur?: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [focused, setFocused] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [q, setQ] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(() => setQ(value.trim()), 200)
    return () => clearTimeout(t)
  }, [value])
  const suggestions = useTimeSuggestions(q, focused)
  const items = suggestions.data ?? []
  const show = focused && !dismissed && items.length > 0
  const listId = React.useId()

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        ref={inputRef}
        id="timer-description"
        value={value}
        placeholder="What are you working on?"
        aria-label="What are you working on?"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          show && active >= 0 ? `${listId}-${active}` : undefined
        }
        className="h-9 border-transparent bg-transparent shadow-none focus-visible:border-input dark:bg-transparent"
        onChange={(e) => {
          onChange(e.target.value)
          setDismissed(false)
          setActive(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setActive(-1)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && items.length) {
            e.preventDefault()
            setDismissed(false)
            setActive((a) => (a + 1) % items.length)
          } else if (e.key === "ArrowUp" && items.length) {
            e.preventDefault()
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
          } else if (e.key === "Escape") {
            setDismissed(true)
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (show && active >= 0 && items[active]) {
              onPick(items[active]!)
              setDismissed(true)
            } else {
              setDismissed(true)
              onCommit()
            }
          }
        }}
      />
      {show ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          <li className="px-2 py-1 text-xs text-muted-foreground" aria-hidden>
            Recent
          </li>
          {items.map((x, i) => (
            <li
              key={`${x.description}|${x.projectId}|${x.taskId}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5",
                i === active && "bg-muted"
              )}
              onMouseEnter={() => setActive(i)}
              // mousedown so the input's blur doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(x)
                setDismissed(true)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{x.description}</span>
              {x.projectName ? (
                <span className="max-w-[40%] truncate text-xs text-primary">
                  {x.projectName}
                  {x.taskTitle ? `: ${x.taskTitle}` : ""}
                </span>
              ) : null}
              {x.tags.slice(0, 1).map((t) => (
                <TagChip key={t.id} tag={t} className="hidden sm:inline-flex" />
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Manual mode: description, project, tags, billable, date + start/end or duration. */
function ManualFields({ today }: { today: string }) {
  const s = useTimerFieldState(null)
  const save = useSaveTimeEntry()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [date, setDate] = React.useState(today)
  const [from, setFrom] = React.useState("09:00")
  const [to, setTo] = React.useState("10:00")
  const [duration, setDuration] = React.useState("")

  const minutes = React.useMemo(() => {
    if (duration.trim()) return parseDuration(duration)
    const [fh, fm] = from.split(":").map(Number)
    const [th, tm] = to.split(":").map(Number)
    if ([fh, fm, th, tm].some((n) => n === undefined || Number.isNaN(n)))
      return null
    let d = th! * 60 + tm! - (fh! * 60 + fm!)
    if (d <= 0) d += 24 * 60 // past midnight
    return d
  }, [from, to, duration])

  const add = () => {
    if (!minutes) {
      toast.error("Enter a valid duration, e.g. 1:30 or 90m")
      return
    }
    const startedAt = localIso(date, from)
    const endedAt = new Date(
      Date.parse(startedAt) + minutes * 60_000
    ).toISOString()
    save.mutate(
      {
        description: s.description,
        projectId: s.target.projectId,
        taskId: s.target.taskId,
        tagIds: s.tags.map((t) => t.id),
        ...(s.billable !== null ? { billable: s.billable } : {}),
        startedAt,
        endedAt,
      },
      {
        onSuccess: (e) => {
          toast.success(`Logged ${formatDuration(e.durationSeconds ?? 0)}`)
          s.setDescription("")
          setDuration("")
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    )
  }

  return (
    <>
      <DescriptionInput
        inputRef={inputRef}
        value={s.description}
        onChange={s.setDescription}
        onPick={(x) => {
          s.setDescription(x.description)
          s.setTarget({ projectId: x.projectId, taskId: x.taskId })
          s.setLabel({
            projectName: x.projectName,
            clientName: x.clientName,
            taskTitle: x.taskTitle,
          })
          s.setTags(x.tags)
          s.setBillable(x.billable)
        }}
        onCommit={add}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <ProjectPopover
          value={s.target}
          label={s.label}
          compact
          className="min-w-0 shrink"
          onChange={(t, l) => {
            s.setTarget(t)
            s.setLabel(l)
          }}
        />
        <TagPicker value={s.tags} compact onChange={s.setTags} />
        <BillableToggle value={s.billable ?? true} onChange={s.setBillable} />
        <div className="flex items-center gap-1">
          <Input
            type="time"
            aria-label="Start time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 w-[5.5rem] px-1.5 tabular-nums"
          />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <Input
            type="time"
            aria-label="End time"
            value={to}
            disabled={Boolean(duration.trim())}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 w-[5.5rem] px-1.5 tabular-nums"
          />
          <DateInput
            aria-label="Date"
            className="w-[9.5rem]"
            value={date}
            onChange={(v) => setDate(v)}
            required
          />
        </div>
        <Input
          aria-label="Duration"
          placeholder={minutes ? formatDuration(minutes * 60) : "1:30"}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-8 w-16 px-1.5 text-right font-mono tabular-nums"
        />
        <Button
          className="ml-auto w-20 sm:ml-1"
          disabled={save.isPending}
          onClick={add}
        >
          Add
        </Button>
      </div>
    </>
  )
}
