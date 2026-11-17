"use client"

import {
  formatDuration,
  TAG_COLORS,
  type TagColor,
  type TimeEntry,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { useShortcut } from "@/lib/shortcuts"
import { formatDate } from "@/lib/format"

import { useSaveTimeEntry } from "../api/mutations"
import { useTimeEntries } from "../api/queries"
import { useTimesheet } from "../api/reports"
import { addDays, weekStart } from "../duration"
import { hhmm, zonedParts, zonedToUtc } from "../zoned"
import { CalendarEntryDialog, type Slot } from "./calendar-entry-dialog"
import { TAG_COLOR_CLASSES, TAG_DOT_CLASSES } from "./tag-chip"

const HOUR_PX = 48
const PX = HOUR_PX / 60 // per minute
const SNAP = 15
const DAY = 1440
const DRAG_THRESHOLD = 4

const PROJECT_COLORS = TAG_COLORS.filter((c) => c !== "gray")
function projectColor(projectId: string | null): TagColor {
  if (!projectId) return "gray"
  let h = 0
  for (const ch of projectId) h = (h * 31 + ch.charCodeAt(0)) | 0
  return PROJECT_COLORS[Math.abs(h) % PROJECT_COLORS.length]!
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/** Where an entry sits: column date and minutes from that day's midnight. */
interface Span {
  date: string
  start: number
  end: number
}

type Drag =
  | { kind: "create"; x: number; y: number; moved: boolean; slot: Slot }
  | {
      kind: "move" | "place" | "resize"
      x: number
      y: number
      moved: boolean
      entry: TimeEntry
      /** Minutes between the block's top and the pointer (move/place). */
      grab: number
      length: number
      span: Span
    }

/** Side-by-side columns for overlapping blocks within one day. */
function layoutDay<T extends { id: string; start: number; end: number }>(
  items: T[]
) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out = new Map<string, { col: number; cols: number }>()
  let cluster: { id: string; col: number }[] = []
  let colEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const c of cluster)
      out.set(c.id, { col: c.col, cols: Math.max(1, colEnds.length) })
    cluster = []
    colEnds = []
  }
  for (const it of sorted) {
    if (it.start >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= it.start)
    if (col === -1) col = colEnds.length
    colEnds[col] = it.end
    cluster.push({ id: it.id, col })
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return out
}

/**
 * Week (or day) calendar of your own time in the workspace time zone. Drag on
 * empty space to log time; drag a block to move it, its bottom edge to resize
 * it. Entries logged as a duration sit in the "No set time" row until placed.
 */
export function TimeCalendar({ today }: { today: string }) {
  const { can } = usePermissions()
  const profile = useWorkspaceProfile()
  const tz = profile.data?.timezone ?? "UTC"
  const locale = profile.data?.locale
  const save = useSaveTimeEntry()
  const canTrack = can("time.track") || can("time.manage")

  const [day, setDay] = useQueryState("day", parseAsString.withDefault(today))
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["week", "day"] as const)
  )
  // Phones default to one day; a chosen view sticks in the URL.
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    setNarrow(mq.matches)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  const mode = view ?? (narrow ? "day" : "week")
  const start = weekStart(day)
  const days =
    mode === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(start, i))
      : [day]

  // A submitted or approved week (timesheet approvals) takes no new time.
  const weekSheet = useTimesheet(start).data
  const weekLocked = weekSheet?.locked ?? false
  /** Days before this are in the workspace's locked period. */
  const lockedBefore = weekSheet?.lockedBefore ?? null
  const dayLocked = (d: string) => lockedBefore !== null && d < lockedBefore
  const canLog = canTrack && !weekLocked
  const entries = useTimeEntries({
    from: start,
    to: addDays(start, 6),
    memberId: "me",
  })

  // Now (for the running timer and the red line), refreshed every 30 s.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const canWrite = React.useCallback(
    (e: TimeEntry) =>
      !e.invoiceId &&
      !e.approvalLocked &&
      !e.periodLocked &&
      !e.isRunning &&
      (e.isMine ? canTrack : can("time.manage")),
    [can, canTrack]
  )

  // Optimistic positions while a move/resize saves.
  const [pending, setPending] = React.useState<Record<string, Span>>({})
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const dragRef = React.useRef<Drag | null>(null)
  const suppressClick = React.useRef(false)
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const [editing, setEditing] = React.useState<TimeEntry | null>(null)

  const items = React.useMemo(() => entries.data?.items ?? [], [entries.data])
  const timed: (TimeEntry & Span)[] = []
  const untimed = new Map<string, TimeEntry[]>()
  for (const e of items) {
    if (!e.hasTimes) {
      untimed.set(e.entryDate, [...(untimed.get(e.entryDate) ?? []), e])
      continue
    }
    const p = pending[e.id]
    if (p) {
      timed.push({ ...e, ...p })
      continue
    }
    const s = zonedParts(e.startedAt, tz)
    const endMs = e.endedAt ? new Date(e.endedAt).getTime() : now
    const len = Math.max(
      SNAP / 2,
      (endMs - new Date(e.startedAt).getTime()) / 60_000
    )
    timed.push({
      ...e,
      date: e.entryDate,
      start: s.minutes,
      end: s.minutes + len,
    })
  }
  const anyUntimed = days.some((d) => untimed.has(d))

  const dayTotals = days.map((d) =>
    items
      .filter((e) => e.entryDate === d)
      .reduce(
        (s, e) =>
          s +
          (e.durationSeconds ??
            Math.max(0, (now - new Date(e.startedAt).getTime()) / 1000)),
        0
      )
  )
  const total = dayTotals.reduce((a, b) => a + b, 0)

  // ── Pointer handling ─────────────────────────────────────
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const colsRef = React.useRef<HTMLDivElement>(null)

  const pointAt = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = colsRef.current!.getBoundingClientRect()
      const i = clamp(
        Math.floor(((clientX - rect.left) / rect.width) * days.length),
        0,
        days.length - 1
      )
      return { dayIndex: i, minute: clamp((clientY - rect.top) / PX, 0, DAY) }
    },
    [days.length]
  )

  const commit = React.useCallback(
    (entry: TimeEntry, span: Span) => {
      if (lockedBefore && span.date < lockedBefore) {
        toast.error(`Time before ${lockedBefore} is locked`)
        return
      }
      setPending((p) => ({ ...p, [entry.id]: span }))
      save.mutate(
        {
          id: entry.id,
          startedAt: zonedToUtc(span.date, span.start, tz).toISOString(),
          endedAt: zonedToUtc(span.date, span.end, tz).toISOString(),
        },
        {
          onError: (err) => toast.error(errorMessage(err)),
          onSettled: () =>
            setPending((p) => {
              const { [entry.id]: _, ...rest } = p
              return rest
            }),
        }
      )
    },
    [save, tz, lockedBefore]
  )

  // Latest values for the window listeners of an ongoing drag.
  const latest = React.useRef({ pointAt, commit, days })
  latest.current = { pointAt, commit, days }
  const updateDrag = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }

  /** Track a drag with window listeners, attached right away (fast gestures). */
  const beginDrag = (initial: Drag) => {
    updateDrag(initial)
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const moved =
        d.moved ||
        Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > DRAG_THRESHOLD
      if (!moved) return
      // Scroll when dragging near the top/bottom edge.
      const sc = scrollRef.current
      if (sc) {
        const r = sc.getBoundingClientRect()
        if (ev.clientY < r.top + 24) sc.scrollTop -= 12
        else if (ev.clientY > r.bottom - 24) sc.scrollTop += 12
      }
      const { pointAt, days } = latest.current
      const { dayIndex, minute } = pointAt(ev.clientX, ev.clientY)
      if (d.kind === "create") {
        const anchor = d.slot.start
        const m = snap(minute)
        updateDrag({
          ...d,
          moved,
          slot: {
            date: d.slot.date,
            start: Math.min(anchor, m),
            end: Math.max(anchor + SNAP, m),
          },
        })
      } else if (d.kind === "resize") {
        updateDrag({
          ...d,
          moved,
          span: {
            ...d.span,
            end: clamp(snap(minute), d.span.start + SNAP, DAY + 12 * 60),
          },
        })
      } else {
        const s = clamp(snap(minute - d.grab), 0, DAY - SNAP)
        updateDrag({
          ...d,
          moved,
          span: { date: days[dayIndex]!, start: s, end: s + d.length },
        })
      }
    }
    const finish = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      move(ev)
      const d = dragRef.current
      updateDrag(null)
      if (!d || ev.type === "pointercancel") return
      if (d.kind === "create") {
        setSlot(
          d.moved
            ? d.slot
            : { ...d.slot, end: Math.min(d.slot.start + 60, DAY) }
        )
        return
      }
      if (!d.moved) return // a click: onClick opens the entry
      // Swallow the click that follows this pointerup, if any.
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      latest.current.commit(d.entry, d.span)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  const startCreate = (ev: React.PointerEvent, date: string) => {
    if (!canLog || ev.button !== 0 || ev.target !== ev.currentTarget) return
    if (dayLocked(date)) return
    const { minute } = pointAt(ev.clientX, ev.clientY)
    const m = clamp(Math.floor(minute / SNAP) * SNAP, 0, DAY - SNAP)
    beginDrag({
      kind: "create",
      x: ev.clientX,
      y: ev.clientY,
      moved: false,
      slot: { date, start: m, end: m + SNAP },
    })
  }

  const startEntryDrag = (
    ev: React.PointerEvent,
    entry: TimeEntry & Partial<Span>,
    kind: "move" | "place" | "resize"
  ) => {
    if (ev.button !== 0 || !canWrite(entry)) return
    ev.stopPropagation()
    const length =
      kind === "place"
        ? Math.max(SNAP, Math.round((entry.durationSeconds ?? 3600) / 60))
        : entry.end! - entry.start!
    const { minute } = pointAt(ev.clientX, ev.clientY)
    beginDrag({
      kind,
      x: ev.clientX,
      y: ev.clientY,
      moved: false,
      entry,
      grab: kind === "place" ? Math.min(30, length / 2) : minute - entry.start!,
      length,
      span:
        kind === "place"
          ? { date: entry.entryDate, start: 9 * 60, end: 9 * 60 + length }
          : { date: entry.date!, start: entry.start!, end: entry.end! },
    })
  }

  const openEntry = (e: TimeEntry) => {
    if (suppressClick.current) return
    if (e.isRunning) {
      toast.info("Stop the timer to change this entry")
      return
    }
    setEditing(e)
  }

  // Start scrolled to the working day (or the earliest entry).
  React.useEffect(() => {
    const sc = scrollRef.current
    if (!sc || entries.isPending) return
    const first = Math.min(
      8 * 60,
      ...timed.filter((t) => days.includes(t.date)).map((t) => t.start)
    )
    sc.scrollTop = Math.max(0, (first - 30) * PX)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, mode, entries.isPending])

  // ── Rendering ────────────────────────────────────────────
  const weekday = new Intl.DateTimeFormat(locale ?? "en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
  const dayNum = new Intl.DateTimeFormat(locale ?? "en-US", {
    day: "numeric",
    timeZone: "UTC",
  })
  const hourLabel = new Intl.DateTimeFormat(locale ?? "en-US", {
    hour: "numeric",
    timeZone: "UTC",
  })
  const nowParts = zonedParts(now, tz)
  const step = mode === "week" ? 7 : 1
  useShortcut("ArrowLeft", () => void setDay(addDays(day, -step)))
  useShortcut("ArrowRight", () => void setDay(addDays(day, step)))
  useShortcut("t", () => void setDay(null))
  useShortcut("w", () => void setView(mode === "week" ? "day" : "week"))
  const rangeLabel =
    mode === "week"
      ? `${formatDate(start, locale)} – ${formatDate(addDays(start, 6), locale)}`
      : `${weekday.format(new Date(`${day}T00:00:00Z`))}, ${formatDate(day, locale)}`
  const isCurrent = mode === "week" ? start === weekStart(today) : day === today

  const dragged = drag && drag.kind !== "create" ? drag : null
  const gridCols = {
    gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={mode === "week" ? "Previous week" : "Previous day"}
          onClick={() => void setDay(addDays(day, -step))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={mode === "week" ? "Next week" : "Next day"}
          onClick={() => void setDay(addDays(day, step))}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
        </Button>
        <h2 className="text-sm font-medium">{rangeLabel}</h2>
        {isCurrent ? null : (
          <Button variant="ghost" size="sm" onClick={() => void setDay(null)}>
            Today
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDuration(mode === "week" ? total : (dayTotals[0] ?? 0))}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Tabs
            value={mode}
            onValueChange={(v) => void setView(v as "week" | "day")}
          >
            <TabsList>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="day">Day</TabsTrigger>
            </TabsList>
          </Tabs>
          {canLog ? (
            <Button
              size="sm"
              onClick={() => {
                const date = days.includes(today) ? today : days[0]!
                const s =
                  date === today
                    ? clamp(
                        Math.floor(nowParts.minutes / SNAP) * SNAP,
                        0,
                        DAY - 60
                      )
                    : 9 * 60
                setSlot({ date, start: s, end: s + 60 })
              }}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              Log time
            </Button>
          ) : null}
        </div>
      </div>

      {entries.isPending ? (
        <Skeleton className="h-[640px] w-full" />
      ) : entries.error ? (
        <p className="text-sm text-destructive">{entries.error.message}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div className={cn(mode === "week" && "min-w-[720px]")}>
            {/* Day headers */}
            <div className="flex border-b bg-muted/30">
              <div className="w-14 shrink-0" />
              <div className="grid flex-1" style={gridCols}>
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "flex flex-col items-center gap-0.5 border-l px-1 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === "week" && "hover:bg-muted"
                    )}
                    disabled={mode === "day"}
                    onClick={() => {
                      void setDay(d)
                      void setView("day")
                    }}
                    aria-label={`Show ${formatDate(d, locale)}`}
                  >
                    <span className="text-muted-foreground">
                      {weekday.format(new Date(`${d}T00:00:00Z`))}
                    </span>
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-sm font-medium",
                        d === today && "bg-primary text-primary-foreground"
                      )}
                    >
                      {dayNum.format(new Date(`${d}T00:00:00Z`))}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {dayTotals[i] ? formatDuration(dayTotals[i]!) : "—"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Entries without clock times */}
            {anyUntimed ? (
              <div className="flex border-b">
                <div className="flex w-14 shrink-0 items-start justify-end px-1.5 py-1.5 text-right text-[10px] leading-tight text-muted-foreground">
                  No set time
                </div>
                <div className="grid flex-1" style={gridCols}>
                  {days.map((d) => (
                    <div
                      key={d}
                      className="flex min-w-0 flex-col gap-1 border-l p-1"
                    >
                      {(untimed.get(d) ?? []).map((e) => (
                        <EntryChip
                          key={e.id}
                          entry={e}
                          dimmed={dragged?.entry.id === e.id}
                          draggable={canWrite(e)}
                          onPointerDown={(ev) => startEntryDrag(ev, e, "place")}
                          onClick={() => openEntry(e)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Hour grid */}
            <div
              ref={scrollRef}
              className="relative h-[min(640px,70svh)] overflow-y-auto overscroll-contain"
            >
              <div className="flex" style={{ height: DAY * PX }}>
                <div className="relative w-14 shrink-0">
                  {Array.from({ length: 23 }, (_, h) => (
                    <span
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                      style={{ top: (h + 1) * HOUR_PX }}
                    >
                      {hourLabel.format(new Date(Date.UTC(2000, 0, 1, h + 1)))}
                    </span>
                  ))}
                </div>
                <div
                  ref={colsRef}
                  className="relative grid flex-1 select-none"
                  style={gridCols}
                >
                  {days.map((d) => {
                    const blocks = timed.filter(
                      (t) =>
                        t.date === d &&
                        !(
                          dragged?.kind !== "place" &&
                          dragged?.entry.id === t.id
                        )
                    )
                    const preview =
                      dragged && dragged.moved && dragged.span.date === d
                        ? dragged
                        : null
                    const layout = layoutDay(blocks)
                    const createSlot =
                      drag?.kind === "create" && drag.slot.date === d
                        ? drag.slot
                        : slot && slot.date === d
                          ? slot
                          : null
                    return (
                      <div
                        key={d}
                        role="presentation"
                        className={cn(
                          "relative border-l",
                          canLog && !dayLocked(d) && "cursor-crosshair",
                          d === today && "bg-primary/[0.03]",
                          dayLocked(d) && "bg-muted/50"
                        )}
                        title={
                          dayLocked(d)
                            ? `Time before ${lockedBefore} is locked`
                            : undefined
                        }
                        style={{
                          backgroundImage:
                            "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                          backgroundSize: `100% ${HOUR_PX}px`,
                        }}
                        onPointerDown={(ev) => startCreate(ev, d)}
                      >
                        {blocks.map((b) => {
                          const pos = layout.get(b.id)!
                          return (
                            <EntryBlock
                              key={b.id}
                              entry={b}
                              top={b.start * PX}
                              height={(Math.min(b.end, DAY) - b.start) * PX}
                              left={pos.col / pos.cols}
                              width={1 / pos.cols}
                              tz={tz}
                              saving={Boolean(pending[b.id])}
                              editable={canWrite(b)}
                              dimmed={
                                dragged?.kind === "place" &&
                                dragged.entry.id === b.id
                              }
                              onPointerDown={(ev) =>
                                startEntryDrag(ev, b, "move")
                              }
                              onResizeDown={(ev) =>
                                startEntryDrag(ev, b, "resize")
                              }
                              onClick={() => openEntry(b)}
                            />
                          )
                        })}
                        {preview ? (
                          <EntryBlock
                            entry={preview.entry}
                            top={preview.span.start * PX}
                            height={
                              (Math.min(preview.span.end, DAY) -
                                preview.span.start) *
                              PX
                            }
                            left={0}
                            width={1}
                            tz={tz}
                            label={`${hhmm(preview.span.start)} – ${hhmm(preview.span.end)}`}
                            ghost
                          />
                        ) : null}
                        {createSlot ? (
                          <div
                            className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-primary bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary tabular-nums"
                            style={{
                              top: createSlot.start * PX,
                              height: (createSlot.end - createSlot.start) * PX,
                            }}
                          >
                            {hhmm(createSlot.start)} – {hhmm(createSlot.end)}
                          </div>
                        ) : null}
                        {d === nowParts.date ? (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500"
                            style={{ top: nowParts.minutes * PX }}
                          >
                            <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-red-500" />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {weekLocked ? (
        <p className="text-sm text-muted-foreground">
          This week&apos;s timesheet is submitted or approved, so its time is
          locked. See the Timesheet tab.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Times are in the workspace time zone ({tz}). Drag on empty space to log
        time, drag a block to move it, or drag its bottom edge to change its
        length.
      </p>

      <CalendarEntryDialog
        open={slot !== null || editing !== null}
        onOpenChange={(o) => {
          if (o) return
          setSlot(null)
          setEditing(null)
        }}
        entry={editing}
        slot={slot}
        tz={tz}
        readOnly={editing ? !canWrite(editing) : false}
      />
    </div>
  )
}

function entryTitle(e: TimeEntry) {
  return e.description || e.taskTitle || e.projectName || "(no description)"
}

function entrySubtitle(e: TimeEntry) {
  return [e.projectName, e.taskTitle, e.clientName].filter(Boolean).join(" · ")
}

function EntryBlock({
  entry,
  top,
  height,
  left,
  width,
  tz,
  label,
  ghost,
  saving,
  editable,
  dimmed,
  onPointerDown,
  onResizeDown,
  onClick,
}: {
  entry: TimeEntry
  top: number
  height: number
  left: number
  width: number
  tz: string
  label?: string
  ghost?: boolean
  saving?: boolean
  editable?: boolean
  dimmed?: boolean
  onPointerDown?: (ev: React.PointerEvent) => void
  onResizeDown?: (ev: React.PointerEvent) => void
  onClick?: () => void
}) {
  const color = projectColor(entry.projectId)
  const s = zonedParts(entry.startedAt, tz).minutes
  const range =
    label ??
    (entry.isRunning
      ? `${hhmm(s)} – now`
      : entry.endedAt
        ? `${hhmm(s)} – ${hhmm(zonedParts(entry.endedAt, tz).minutes)}`
        : "")
  const sub = entrySubtitle(entry)
  const h = Math.max(height, 14)
  return (
    <div
      className={cn(
        "absolute z-10 px-0.5",
        ghost && "pointer-events-none z-30",
        dimmed && "opacity-40"
      )}
      style={{
        top,
        height: h,
        left: `${left * 100}%`,
        width: `${width * 100}%`,
      }}
    >
      <button
        type="button"
        className={cn(
          "relative flex size-full flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
          TAG_COLOR_CLASSES[color],
          color === "gray" && "border-l-muted-foreground/50",
          editable
            ? "cursor-grab touch-none active:cursor-grabbing"
            : "cursor-pointer",
          entry.isRunning &&
            "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.04)_6px_12px)]",
          ghost && "shadow-md ring-2 ring-primary",
          saving && "animate-pulse"
        )}
        style={{ borderLeftColor: dotColor(color) }}
        title={[entryTitle(entry), sub, range].filter(Boolean).join("\n")}
        aria-label={`${entryTitle(entry)}${sub ? `, ${sub}` : ""}, ${range}${entry.invoiceId ? ", invoiced" : ""}`}
        onPointerDown={onPointerDown}
        onClick={onClick}
      >
        <span className="flex items-center gap-1 truncate font-medium">
          {entry.invoiceId ? (
            <HugeiconsIcon
              icon={SquareLock02Icon}
              strokeWidth={2}
              className="size-3 shrink-0"
            />
          ) : null}
          <span className="truncate">{entryTitle(entry)}</span>
        </span>
        {h >= 34 && sub ? (
          <span className="truncate opacity-80">{sub}</span>
        ) : null}
        {h >= 48 ? (
          <span className="tabular-nums opacity-70">{range}</span>
        ) : null}
      </button>
      {editable && onResizeDown ? (
        <span
          aria-hidden
          className="absolute inset-x-1 bottom-0 h-2 cursor-ns-resize touch-none"
          onPointerDown={onResizeDown}
        />
      ) : null}
    </div>
  )
}

/** Solid accent for the block's left edge (Tailwind bg class → CSS colour). */
function dotColor(color: TagColor) {
  const map: Record<TagColor, string> = {
    gray: "",
    green: "var(--color-green-500)",
    teal: "var(--color-teal-500)",
    blue: "var(--color-blue-500)",
    violet: "var(--color-violet-500)",
    pink: "var(--color-pink-500)",
    red: "var(--color-red-500)",
    orange: "var(--color-orange-500)",
    amber: "var(--color-amber-500)",
  }
  return map[color] || undefined
}

function EntryChip({
  entry,
  draggable,
  dimmed,
  onPointerDown,
  onClick,
}: {
  entry: TimeEntry
  draggable: boolean
  dimmed?: boolean
  onPointerDown: (ev: React.PointerEvent) => void
  onClick: () => void
}) {
  const color = projectColor(entry.projectId)
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        TAG_COLOR_CLASSES[color],
        draggable ? "cursor-grab touch-none" : "cursor-pointer",
        dimmed && "opacity-40"
      )}
      title={
        draggable
          ? `${entryTitle(entry)} — drag onto the calendar to give it times`
          : entryTitle(entry)
      }
      aria-label={`${entryTitle(entry)}, ${formatDuration(entry.durationSeconds ?? 0)}, no set time${entry.invoiceId ? ", invoiced" : ""}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {entry.invoiceId ? (
        <HugeiconsIcon
          icon={SquareLock02Icon}
          strokeWidth={2}
          className="size-3 shrink-0"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            TAG_DOT_CLASSES[color]
          )}
        />
      )}
      <span className="shrink-0 font-medium tabular-nums">
        {formatDuration(entry.durationSeconds ?? 0)}
      </span>
      <span className="truncate">{entryTitle(entry)}</span>
    </button>
  )
}
