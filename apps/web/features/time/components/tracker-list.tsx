"use client"

import { formatDuration, type TimeEntry } from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Cancel01Icon,
  MoreHorizontalIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import {
  useBulkDeleteEntries,
  useBulkUpdateEntries,
  useContinueEntry,
  useDeleteTimeEntry,
  useDuplicateEntry,
  useSaveTimeEntry,
} from "../api/mutations"
import { useCreateFavorite } from "../api/favorites"
import { useTimeEntries } from "../api/queries"
import { addDays, weekStart } from "../duration"
import { ProjectPopover } from "./project-popover"
import { TagPicker } from "./tag-picker"
import { BillableToggle } from "./timer-bar"

type Week = { start: string; seconds: number; days: Day[] }
type Day = { date: string; seconds: number; groups: TimeEntry[][] }

const sum = (xs: TimeEntry[]) =>
  xs.reduce((s, e) => s + (e.durationSeconds ?? 0), 0)

/** Entries that read the same (Clockify groups these into one row). */
const similarKey = (e: TimeEntry) =>
  [
    (e.description ?? "").trim().toLowerCase(),
    e.projectId,
    e.taskId,
    e.tags
      .map((t) => t.id)
      .sort()
      .join(","),
    e.billable,
    e.memberId,
  ].join("|")

function groupEntries(items: TimeEntry[]): Week[] {
  const weeks = new Map<string, Map<string, TimeEntry[]>>()
  for (const e of items) {
    const w = weekStart(e.entryDate)
    const days = weeks.get(w) ?? new Map<string, TimeEntry[]>()
    days.set(e.entryDate, [...(days.get(e.entryDate) ?? []), e])
    weeks.set(w, days)
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([start, days]) => {
      const dayList = [...days.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, entries]) => {
          const groups = new Map<string, TimeEntry[]>()
          for (const e of entries) {
            const k = similarKey(e)
            groups.set(k, [...(groups.get(k) ?? []), e])
          }
          return { date, seconds: sum(entries), groups: [...groups.values()] }
        })
      return {
        start,
        seconds: dayList.reduce((s, d) => s + d.seconds, 0),
        days: dayList,
      }
    })
}

/** Local "YYYY-MM-DD" and "HH:MM" of an instant (browser time zone). */
function localParts(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/**
 * Clockify-style list: weeks → days → entries, newest first, with totals.
 * Similar entries in a day collapse into one row. Rows edit in place; the
 * checkboxes drive a bulk bar.
 */
export function TrackerList({ today }: { today: string }) {
  const { can } = usePermissions()
  const locale = useWorkspaceProfile().data?.locale
  const [who, setWho] = useQueryState(
    "who",
    parseAsStringLiteral(["me", "all"] as const).withDefault("me")
  )
  const [weeks, setWeeks] = React.useState(2)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const thisWeek = weekStart(today)
  const from = addDays(thisWeek, -7 * (weeks - 1))
  const everyone = who === "all" && can("time.read")
  const entries = useTimeEntries({
    from,
    to: addDays(thisWeek, 6),
    memberId: everyone ? undefined : "me",
  })
  // The member's own running timer lives in the timer bar.
  const items = React.useMemo(
    () => (entries.data?.items ?? []).filter((e) => !(e.isRunning && e.isMine)),
    [entries.data]
  )
  const grouped = React.useMemo(() => groupEntries(items), [items])

  const canWrite = React.useCallback(
    (e: TimeEntry) =>
      !e.invoiceId &&
      !e.approvalLocked &&
      !e.periodLocked &&
      (e.isMine ? can("time.track") || can("time.manage") : can("time.manage")),
    [can]
  )
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  // Drop selections that disappeared (deleted, filtered out).
  React.useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(items.map((e) => e.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const weekLabel = (start: string) =>
    start === thisWeek
      ? "This week"
      : start === addDays(thisWeek, -7)
        ? "Last week"
        : `${formatDate(start, locale)} – ${formatDate(addDays(start, 6), locale)}`

  return (
    <div className="flex flex-col gap-4">
      {can("time.read") ? (
        <Tabs value={who} onValueChange={(v) => void setWho(v as "me" | "all")}>
          <TabsList>
            <TabsTrigger value="me">Mine</TabsTrigger>
            <TabsTrigger value="all">Everyone</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {selected.size > 0 ? (
        <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />
      ) : null}

      {entries.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : entries.error ? (
        <p className="text-sm text-destructive">{entries.error.message}</p>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No time tracked in the last {weeks} weeks. Type what you’re working on
          above and press Start.
        </div>
      ) : (
        grouped.map((w) => (
          <section key={w.start} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between px-1 text-sm">
              <h2 className="font-medium">{weekLabel(w.start)}</h2>
              <span className="text-muted-foreground">
                Week total{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatDuration(w.seconds)}
                </span>
              </span>
            </div>
            {w.days.map((d) => {
              const editable = d.groups.flat().filter(canWrite)
              const allOn =
                editable.length > 0 && editable.every((e) => selected.has(e.id))
              return (
                <div
                  key={d.date}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-sm">
                    <Checkbox
                      aria-label={`Select ${d.date}`}
                      checked={allOn}
                      disabled={editable.length === 0}
                      onCheckedChange={(v) =>
                        toggle(
                          editable.map((e) => e.id),
                          Boolean(v)
                        )
                      }
                    />
                    <span className="font-medium">
                      {d.date === today
                        ? "Today"
                        : d.date === addDays(today, -1)
                          ? "Yesterday"
                          : new Intl.DateTimeFormat(locale ?? "en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            }).format(new Date(`${d.date}T00:00:00Z`))}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      Total{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatDuration(d.seconds)}
                      </span>
                    </span>
                  </div>
                  <ul className="divide-y">
                    {d.groups.map((g) =>
                      g.length === 1 ? (
                        <EntryRow
                          key={g[0]!.id}
                          entry={g[0]!}
                          editable={canWrite(g[0]!)}
                          selected={selected.has(g[0]!.id)}
                          onSelect={(on) => toggle([g[0]!.id], on)}
                          showMember={everyone}
                          locale={locale}
                        />
                      ) : (
                        <GroupRows
                          key={g.map((e) => e.id).join()}
                          entries={g}
                          canWrite={canWrite}
                          selected={selected}
                          toggle={toggle}
                          showMember={everyone}
                          locale={locale}
                        />
                      )
                    )}
                  </ul>
                </div>
              )
            })}
          </section>
        ))
      )}

      {entries.data ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={entries.isFetching}
          onClick={() => setWeeks((n) => n + 4)}
        >
          Load older weeks
        </Button>
      ) : null}
    </div>
  )
}

/** Several similar entries: one summary row that expands to the entries. */
function GroupRows({
  entries,
  canWrite,
  selected,
  toggle,
  showMember,
  locale,
}: {
  entries: TimeEntry[]
  canWrite: (e: TimeEntry) => boolean
  selected: Set<string>
  toggle: (ids: string[], on: boolean) => void
  showMember: boolean
  locale?: string
}) {
  const [open, setOpen] = React.useState(false)
  const first = entries[0]!
  const editable = entries.filter(canWrite)
  const allOn = editable.length > 0 && editable.every((e) => selected.has(e.id))
  const total = sum(entries)
  const cont = useContinueEntry()
  const starts = entries.map((e) => e.startedAt).sort()
  const ends = entries
    .map((e) => e.endedAt)
    .filter((x): x is string => Boolean(x))
    .sort()

  return (
    <>
      <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
        <Checkbox
          aria-label="Select group"
          checked={allOn}
          disabled={editable.length === 0}
          onCheckedChange={(v) =>
            toggle(
              editable.map((e) => e.id),
              Boolean(v)
            )
          }
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${entries.length} entries`}
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded border px-1 text-xs font-medium tabular-nums hover:bg-muted",
            open && "border-primary text-primary"
          )}
        >
          {entries.length}
        </button>
        <span className="min-w-0 flex-1 truncate">
          {first.description || (
            <span className="text-muted-foreground">No description</span>
          )}
          {showMember ? (
            <span className="text-muted-foreground"> · {first.memberName}</span>
          ) : null}
        </span>
        <EntryMeta entry={first} />
        <span className="hidden w-36 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:inline">
          {timeRange(starts[0]!, ends.at(-1) ?? null, locale)}
        </span>
        <span className="w-14 text-right font-medium tabular-nums">
          {formatDuration(total)}
        </span>
        <ContinueButton
          disabled={!first.isMine || cont.isPending}
          onClick={() =>
            cont.mutate(first.id, {
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        />
        <span className="size-8" aria-hidden />
      </li>
      {open
        ? entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              nested
              editable={canWrite(e)}
              selected={selected.has(e.id)}
              onSelect={(on) => toggle([e.id], on)}
              showMember={showMember}
              locale={locale}
            />
          ))
        : null}
    </>
  )
}

/** Read-only project + tags (for group rows and locked entries). */
function EntryMeta({ entry }: { entry: TimeEntry }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      {entry.projectName ? (
        <span className="max-w-48 truncate text-primary">
          {entry.projectName}
          {entry.taskTitle ? `: ${entry.taskTitle}` : ""}
        </span>
      ) : null}
      {entry.tags.length ? (
        <span className="text-muted-foreground">
          {entry.tags.map((t) => t.name).join(", ")}
        </span>
      ) : null}
      {!entry.billable ? (
        <span className="text-muted-foreground">Non-billable</span>
      ) : null}
    </span>
  )
}

function timeRange(start: string, end: string | null, locale?: string) {
  const f = new Intl.DateTimeFormat(locale ?? undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${f.format(new Date(start))} – ${end ? f.format(new Date(end)) : "…"}`
}

function ContinueButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label="Continue this entry"
      title="Continue"
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
    >
      <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={1.8} />
    </button>
  )
}

function EntryRow({
  entry: e,
  editable,
  selected,
  onSelect,
  showMember,
  nested,
  locale,
}: {
  entry: TimeEntry
  editable: boolean
  selected: boolean
  onSelect: (on: boolean) => void
  showMember: boolean
  nested?: boolean
  locale?: string
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const save = useSaveTimeEntry()
  const cont = useContinueEntry()
  const pin = useCreateFavorite()
  const duplicate = useDuplicateEntry()
  const remove = useDeleteTimeEntry()
  const [description, setDescription] = React.useState(e.description ?? "")
  const [confirm, setConfirm] = React.useState(false)
  React.useEffect(() => setDescription(e.description ?? ""), [e.description])

  const onError = (err: unknown) => toast.error(errorMessage(err))
  const patch = (body: Parameters<typeof save.mutate>[0]) =>
    save.mutate({ id: e.id, ...body }, { onError })

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-sm",
        nested && "bg-muted/30 pl-6",
        selected && "bg-primary/5"
      )}
    >
      <Checkbox
        aria-label="Select entry"
        checked={selected}
        disabled={!editable}
        onCheckedChange={(v) => onSelect(Boolean(v))}
      />
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-1">
        {editable ? (
          <Input
            value={description}
            placeholder="Add description"
            aria-label="Description"
            className="h-8 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input dark:bg-transparent"
            onChange={(ev) => setDescription(ev.target.value)}
            onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
            onBlur={() => {
              if (description !== (e.description ?? "")) patch({ description })
            }}
          />
        ) : (
          <span className="truncate px-1.5">
            {e.description || (
              <span className="text-muted-foreground">No description</span>
            )}
          </span>
        )}
        {showMember ? (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {e.memberName}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center gap-1">
        {editable ? (
          <>
            <ProjectPopover
              value={{ projectId: e.projectId, taskId: e.taskId }}
              label={e}
              compact
              className="max-w-56 min-w-0"
              onChange={(t) =>
                patch({ projectId: t.projectId, taskId: t.taskId })
              }
            />
            <TagPicker
              value={e.tags}
              compact
              onChange={(tags) => patch({ tagIds: tags.map((t) => t.id) })}
            />
            <BillableToggle
              value={e.billable}
              onChange={(billable) => patch({ billable })}
            />
          </>
        ) : (
          <>
            <EntryMeta entry={e} />
            {e.isRunning ? <Badge variant="secondary">Running</Badge> : null}
            {e.invoiceId ? (
              <Link href={`/${slug}/invoices/${e.invoiceId}`}>
                <Badge variant="outline">{e.invoiceNumber ?? "Invoiced"}</Badge>
              </Link>
            ) : null}
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {editable && e.endedAt ? (
          <TimeRangePopover entry={e} locale={locale} onSave={patch} />
        ) : (
          <span className="hidden w-36 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:inline">
            {timeRange(e.startedAt, e.endedAt, locale)}
          </span>
        )}
        <span className="w-14 text-right font-medium tabular-nums">
          {e.durationSeconds !== null ? formatDuration(e.durationSeconds) : "…"}
        </span>
        <ContinueButton
          disabled={!e.isMine || cont.isPending}
          onClick={() => cont.mutate(e.id, { onError })}
        />
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="More actions"
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  duplicate.mutate(e.id, {
                    onSuccess: () => toast.success("Entry duplicated"),
                    onError,
                  })
                }
              >
                Duplicate
              </DropdownMenuItem>
              {e.isMine ? (
                <DropdownMenuItem
                  onClick={() =>
                    pin.mutate(
                      {
                        description: e.description,
                        projectId: e.projectId,
                        taskId: e.taskId,
                        tagIds: e.tags.map((t) => t.id),
                        billable: e.billable,
                      },
                      {
                        onSuccess: () => toast.success("Added to favourites"),
                        onError,
                      }
                    )
                  }
                >
                  Add to favourites
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirm(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="size-8" aria-hidden />
        )}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this time entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatDuration(e.durationSeconds ?? 0)}
              {e.description ? ` of “${e.description}”` : ""} will be removed.
              This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(e.id, {
                  onSuccess: () => toast.success("Entry deleted"),
                  onError,
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/** Start–end times of a finished entry, editable in a small popover. */
function TimeRangePopover({
  entry,
  locale,
  onSave,
}: {
  entry: TimeEntry
  locale?: string
  onSave: (body: { startedAt: string; endedAt: string }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const start = localParts(entry.startedAt)
  const end = localParts(entry.endedAt!)
  const [date, setDate] = React.useState(start.date)
  const [from, setFrom] = React.useState(start.time)
  const [to, setTo] = React.useState(end.time)
  React.useEffect(() => {
    if (!open) return
    setDate(start.date)
    setFrom(start.time)
    setTo(end.time)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="hidden h-8 w-36 items-center justify-end rounded-md px-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        aria-label="Edit start and end time"
      >
        {timeRange(entry.startedAt, entry.endedAt, locale)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            const s = new Date(`${date}T${from}`)
            const e = new Date(`${date}T${to}`)
            if (e <= s) e.setDate(e.getDate() + 1) // past midnight
            onSave({ startedAt: s.toISOString(), endedAt: e.toISOString() })
            setOpen(false)
          }}
        >
          <div className="flex items-center gap-1">
            <Input
              type="time"
              aria-label="Start time"
              value={from}
              onChange={(ev) => setFrom(ev.target.value)}
              className="h-8 px-1.5"
            />
            <span aria-hidden>–</span>
            <Input
              type="time"
              aria-label="End time"
              value={to}
              onChange={(ev) => setTo(ev.target.value)}
              className="h-8 px-1.5"
            />
          </div>
          <DateInput
            aria-label="Date"
            className="w-[9.5rem]"
            value={date}
            onChange={(v) => setDate(v)}
            required
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** Actions for the selected entries; invoiced or others' entries are skipped. */
function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const update = useBulkUpdateEntries()
  const remove = useBulkDeleteEntries()
  const [confirm, setConfirm] = React.useState(false)
  const report = (verb: string) => (r: { updated: number; skipped: number }) =>
    toast.success(
      `${verb} ${r.updated} ${r.updated === 1 ? "entry" : "entries"}${r.skipped ? ` · ${r.skipped} skipped (invoiced or not yours)` : ""}`
    )
  const onError = (err: unknown) => toast.error(errorMessage(err))

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className="sticky top-2 z-10 flex flex-wrap items-center gap-1 rounded-lg border bg-popover px-2 py-1.5 text-sm shadow-md"
    >
      <span className="px-1 font-medium">{ids.length} selected</span>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <ProjectPopover
        value={{ projectId: null, taskId: null }}
        label={{ projectName: null, clientName: null, taskTitle: null }}
        onChange={(t) =>
          update.mutate(
            { ids, projectId: t.projectId, taskId: t.taskId },
            { onSuccess: report("Moved"), onError }
          )
        }
      />
      <TagPicker
        value={[]}
        onChange={(tags) =>
          tags.length &&
          update.mutate(
            { ids, tagIds: tags.map((t) => t.id), tagMode: "add" },
            { onSuccess: report("Tagged"), onError }
          )
        }
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          update.mutate(
            { ids, billable: true },
            { onSuccess: report("Updated"), onError }
          )
        }
      >
        Billable
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          update.mutate(
            { ids, billable: false },
            { onSuccess: report("Updated"), onError }
          )
        }
      >
        Non-billable
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirm(true)}
      >
        Delete
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-8"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
      </Button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {ids.length} {ids.length === 1 ? "entry" : "entries"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Invoiced entries are kept. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(ids, {
                  onSuccess: (r) => {
                    report("Deleted")(r)
                    onClear()
                  },
                  onError,
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
