"use client"

import { formatDuration, type TimeEntry } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import Link from "next/link"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useDeleteTimeEntry } from "../api/mutations"
import { useTimeEntries } from "../api/queries"
import { addDays, weekStart } from "../duration"
import { TimeEntryDialog } from "./time-entry-dialog"

/** Week view of time entries with day and week totals. */
export function Timesheet() {
  const { can } = usePermissions()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const locale = profile.data?.locale
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.data?.timezone ?? "UTC",
  }).format(new Date())
  const [week, setWeek] = useQueryState(
    "week",
    parseAsString.withDefault(weekStart(today))
  )
  const [who, setWho] = useQueryState(
    "who",
    parseAsStringLiteral(["me", "all"] as const).withDefault("me")
  )
  const [dialog, setDialog] = React.useState<{
    entry?: TimeEntry
    date: string
  } | null>(null)
  const remove = useDeleteTimeEntry()

  const from = weekStart(week)
  const to = addDays(from, 6)
  const entries = useTimeEntries({
    from,
    to,
    memberId: who === "all" && can("time.read") ? undefined : "me",
  })
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const byDay = (d: string) =>
    (entries.data?.items ?? []).filter((e) => e.entryDate === d)
  const sum = (xs: TimeEntry[]) =>
    xs.reduce((s, e) => s + (e.durationSeconds ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setWeek(addDays(from, -7))}
            aria-label="Previous week"
          >
            ←
          </Button>
          <span className="min-w-44 text-center text-sm font-medium">
            {formatDate(from, locale)} – {formatDate(to, locale)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void setWeek(addDays(from, 7))}
            aria-label="Next week"
          >
            →
          </Button>
          {from !== weekStart(today) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void setWeek(null)}
            >
              This week
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {can("time.read") ? (
            <Tabs
              value={who}
              onValueChange={(v) => void setWho(v as "me" | "all")}
            >
              <TabsList>
                <TabsTrigger value="me">Mine</TabsTrigger>
                <TabsTrigger value="all">Everyone</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <Button
            onClick={() =>
              setDialog({ date: today >= from && today <= to ? today : from })
            }
          >
            Log time
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total
          label="This week"
          value={formatDuration(entries.data?.totalSeconds ?? 0)}
        />
        <Total
          label="Billable"
          value={formatDuration(entries.data?.billableSeconds ?? 0)}
        />
      </div>

      {entries.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : entries.error ? (
        <p className="text-sm text-destructive">{entries.error.message}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {days.map((d) => {
            const items = byDay(d)
            return (
              <Card key={d}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={d === today ? "font-semibold" : "font-medium"}
                    >
                      {new Intl.DateTimeFormat(locale ?? "en-US", {
                        weekday: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${d}T00:00:00Z`))}{" "}
                      <span className="font-normal text-muted-foreground">
                        {formatDate(d, locale)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        {formatDuration(sum(items))}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => setDialog({ date: d })}
                        aria-label={`Log time on ${d}`}
                      >
                        +
                      </Button>
                    </span>
                  </div>
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start justify-between gap-3 border-t pt-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate">
                          <Link
                            className="font-medium hover:underline"
                            href={`/${slug}/projects/${e.projectId}`}
                          >
                            {e.projectName}
                          </Link>
                          {e.taskTitle ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {e.taskTitle}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[e.description, who === "all" ? e.memberName : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {e.isRunning ? (
                          <Badge variant="secondary">Running</Badge>
                        ) : null}
                        {!e.billable ? (
                          <Badge variant="outline">Non-billable</Badge>
                        ) : null}
                        {e.invoiceId ? (
                          <Link href={`/${slug}/invoices/${e.invoiceId}`}>
                            <Badge variant="outline">
                              {e.invoiceNumber ?? "Invoiced"}
                            </Badge>
                          </Link>
                        ) : null}
                        <span className="tabular-nums">
                          {e.durationSeconds !== null
                            ? formatDuration(e.durationSeconds)
                            : "…"}
                        </span>
                        {!e.invoiceId &&
                        !e.isRunning &&
                        (e.isMine
                          ? can("time.track") || can("time.manage")
                          : can("time.manage")) ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() =>
                                setDialog({ entry: e, date: e.entryDate })
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() =>
                                remove.mutate(e.id, {
                                  onSuccess: () =>
                                    toast.success("Entry deleted"),
                                  onError: (err) =>
                                    toast.error(errorMessage(err)),
                                })
                              }
                            >
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <TimeEntryDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        entry={dialog?.entry}
        defaultDate={dialog?.date ?? today}
      />
    </div>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
