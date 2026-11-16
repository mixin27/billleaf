"use client"

import {
  formatDuration,
  type ReportGroup,
  type SummaryReport,
  type TimeEntry,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Download01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  useDataTableState,
} from "@/components/data-table"
import { usePermissions } from "@/components/permissions/can"
import { ColumnChart, type BarDatum } from "@/features/dashboard"
import { useProjects } from "@/features/projects"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useTags } from "../api/queries"
import {
  downloadReportCsv,
  useDetailedReport,
  useSummaryReport,
} from "../api/reports"
import { addDays, weekStart } from "../duration"
import { TagChip } from "./tag-chip"

const PRESETS = [
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "this-year",
  "custom",
] as const
type Preset = (typeof PRESETS)[number]
const PRESET_LABELS: Record<Preset, string> = {
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  custom: "Custom range",
}
const GROUP_LABELS: Record<ReportGroup, string> = {
  project: "Project",
  client: "Client",
  member: "Member",
  tag: "Tag",
  task: "Task",
  date: "Date",
}
const VIEWS = ["summary", "detailed", "weekly"] as const
const ALL = "__all__"

function presetRange(p: Preset, today: string): { from: string; to: string } {
  const monday = weekStart(today)
  const [y, m] = today.split("-").map(Number) as [number, number]
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  switch (p) {
    case "last-week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case "this-month":
      return {
        from: iso(new Date(Date.UTC(y, m - 1, 1))),
        to: iso(new Date(Date.UTC(y, m, 0))),
      }
    case "last-month":
      return {
        from: iso(new Date(Date.UTC(y, m - 2, 1))),
        to: iso(new Date(Date.UTC(y, m - 1, 0))),
      }
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    default:
      return { from: monday, to: addDays(monday, 6) }
  }
}

/** Amounts per currency, e.g. "$1,200.00 · €300.00". */
function amountText(
  amounts: { currency: string; amount: number }[],
  locale?: string
) {
  return amounts.length
    ? amounts.map((a) => money(a.amount, a.currency, locale)).join(" · ")
    : "—"
}

/** Billable amounts minus costs, per currency (only where costs exist). */
function profits(report: Pick<SummaryReport, "amounts" | "costs">) {
  return report.costs.map((c) => ({
    currency: c.currency,
    amount:
      (report.amounts.find((a) => a.currency === c.currency)?.amount ?? 0) -
      c.amount,
  }))
}

/**
 * Clockify-style reports: Summary (chart + groups), Detailed (every entry,
 * paged and sortable) and Weekly (groups × days), with CSV export. Filters
 * live in the URL.
 */
export function TimeReports({ today }: { today: string }) {
  const { can } = usePermissions()
  const locale = useWorkspaceProfile().data?.locale
  const [s, set] = useQueryStates({
    view: parseAsStringLiteral(VIEWS).withDefault("summary"),
    range: parseAsStringLiteral(PRESETS).withDefault("this-week"),
    from: parseAsString,
    to: parseAsString,
    groupBy: parseAsStringLiteral([
      "project",
      "client",
      "member",
      "tag",
      "task",
      "date",
    ] as const).withDefault("project"),
    billable: parseAsStringLiteral(["true", "false"] as const),
    project: parseAsString,
    tag: parseAsString,
  })
  const table = useDataTableState({ sort: "date:desc" })
  const preset = presetRange(s.range, today)
  const from = s.range === "custom" ? (s.from ?? preset.from) : preset.from
  const to = s.range === "custom" ? (s.to ?? preset.to) : preset.to
  const filters = {
    from,
    to,
    ...(s.billable ? { billable: s.billable } : {}),
    ...(s.project === "none"
      ? { withoutProject: "true" as const }
      : s.project
        ? { projectId: [s.project] }
        : {}),
    ...(s.tag ? { tagId: [s.tag] } : {}),
    ...(table.q ? { q: table.q } : {}),
  }
  const groupBy =
    s.view === "weekly" && s.groupBy === "date" ? "project" : s.groupBy
  const summary = useSummaryReport(
    { ...filters, groupBy },
    s.view !== "detailed"
  )
  const projects = useProjects({ status: "active", pageSize: 100 })
  const tags = useTags()
  const [exporting, setExporting] = React.useState(false)

  const groupOptions = (Object.keys(GROUP_LABELS) as ReportGroup[]).filter(
    (g) =>
      (g !== "member" || can("time.read")) &&
      (g !== "date" || s.view === "summary")
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={s.view}
          onValueChange={(v) => void set({ view: v as (typeof VIEWS)[number] })}
        >
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="detailed">Detailed</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await downloadReportCsv(filters)
            } catch (e) {
              toast.error(errorMessage(e))
            } finally {
              setExporting(false)
            }
          }}
        >
          <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={PRESET_LABELS}
          value={s.range}
          onValueChange={(v) =>
            void set({
              range: v as Preset,
              ...(v === "custom" ? { from, to } : { from: null, to: null }),
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {s.range === "custom" ? (
          <>
            <Input
              type="date"
              aria-label="From"
              value={from}
              max={to}
              onChange={(e) =>
                e.target.value && void set({ from: e.target.value })
              }
              className="w-40"
            />
            <Input
              type="date"
              aria-label="To"
              value={to}
              min={from}
              onChange={(e) =>
                e.target.value && void set({ to: e.target.value })
              }
              className="w-40"
            />
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {formatDate(from, locale)} – {formatDate(to, locale)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search description or project…"
          value={table.search}
          onChange={(e) => table.setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select
          items={{
            [ALL]: "All projects",
            none: "No project",
            ...Object.fromEntries(
              (projects.data?.items ?? []).map((p) => [p.id, p.name])
            ),
          }}
          value={s.project ?? ALL}
          onValueChange={(v) =>
            void set({ project: v === ALL ? null : String(v) })
          }
        >
          <SelectTrigger className="w-44" aria-label="Project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            <SelectItem value="none">No project</SelectItem>
            {(projects.data?.items ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{
            [ALL]: "All tags",
            ...Object.fromEntries((tags.data ?? []).map((t) => [t.id, t.name])),
          }}
          value={s.tag ?? ALL}
          onValueChange={(v) => void set({ tag: v === ALL ? null : String(v) })}
        >
          <SelectTrigger className="w-36" aria-label="Tag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tags</SelectItem>
            {(tags.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{
            [ALL]: "Billable and not",
            true: "Billable",
            false: "Non-billable",
          }}
          value={s.billable ?? ALL}
          onValueChange={(v) =>
            void set({
              billable: v === ALL ? null : (v as "true" | "false"),
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Billable">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Billable and not</SelectItem>
            <SelectItem value="true">Billable</SelectItem>
            <SelectItem value="false">Non-billable</SelectItem>
          </SelectContent>
        </Select>
        {s.view !== "detailed" ? (
          <Select
            items={Object.fromEntries(
              groupOptions.map((g) => [
                g,
                `By ${GROUP_LABELS[g].toLowerCase()}`,
              ])
            )}
            value={groupBy}
            onValueChange={(v) => void set({ groupBy: v as ReportGroup })}
          >
            <SelectTrigger className="w-36" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupOptions.map((g) => (
                <SelectItem key={g} value={g}>
                  By {GROUP_LABELS[g].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {s.view === "detailed" ? (
        <DetailedView filters={filters} table={table} locale={locale} />
      ) : summary.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : summary.error ? (
        <p className="text-sm text-destructive">{summary.error.message}</p>
      ) : (
        <>
          <Totals
            report={summary.data}
            locale={locale}
            showCost={can("rate.read")}
          />
          {s.view === "summary" ? (
            <SummaryView
              report={summary.data}
              locale={locale}
              groupLabel={GROUP_LABELS[groupBy]}
            />
          ) : (
            <WeeklyView
              report={summary.data}
              locale={locale}
              groupLabel={GROUP_LABELS[groupBy]}
            />
          )}
        </>
      )}
    </div>
  )
}

function Totals({
  report,
  locale,
  showCost,
}: {
  report: SummaryReport
  locale?: string
  showCost?: boolean
}) {
  const pct = report.totalSeconds
    ? Math.round((report.billableSeconds / report.totalSeconds) * 100)
    : 0
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Tile label="Total" value={formatDuration(report.totalSeconds)} />
      <Tile
        label="Billable"
        value={formatDuration(report.billableSeconds)}
        hint={report.totalSeconds ? `${pct}% of total` : undefined}
      />
      <Tile
        label="Amount"
        value={amountText(report.amounts, locale)}
        hint="Billable hours × hourly rate"
        className="col-span-2 sm:col-span-1"
      />
      {showCost ? (
        <>
          <Tile
            label="Cost"
            value={amountText(report.costs, locale)}
            hint="Tracked hours × member cost rate"
          />
          <Tile
            label="Profit"
            value={amountText(profits(report), locale)}
            hint="Amount − cost"
          />
        </>
      ) : null}
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </p>
        <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

/** Bars per day (≤ 31 days), per week (≤ ~4 months) or per month. */
function chartData(report: SummaryReport, locale?: string): BarDatum[] {
  const n = report.byDay.length
  const buckets = new Map<string, { label: string; seconds: number }>()
  const fmt = (opts: Intl.DateTimeFormatOptions, iso: string) =>
    new Intl.DateTimeFormat(locale ?? "en-US", {
      ...opts,
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`))
  for (const d of report.byDay) {
    const key =
      n <= 31 ? d.date : n <= 124 ? weekStart(d.date) : d.date.slice(0, 7)
    const label =
      n <= 8
        ? fmt({ weekday: "short" }, d.date)
        : n <= 31
          ? fmt({ day: "numeric" }, d.date)
          : n <= 124
            ? fmt({ day: "numeric", month: "short" }, key)
            : fmt({ month: "short" }, `${key}-01`)
    const b = buckets.get(key) ?? { label, seconds: 0 }
    b.seconds += d.seconds
    buckets.set(key, b)
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    label: b.label,
    value: b.seconds,
    display: formatDuration(b.seconds),
  }))
}

function SummaryView({
  report,
  locale,
  groupLabel,
}: {
  report: SummaryReport
  locale?: string
  groupLabel: string
}) {
  if (report.totalSeconds === 0)
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No time in this range. Try a wider range or fewer filters.
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-base font-semibold">Time tracked</p>
          <ColumnChart
            data={chartData(report, locale)}
            caption="Time tracked"
          />
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">{groupLabel}</th>
              <th className="hidden w-1/3 px-3 py-2 text-left font-medium sm:table-cell">
                Share
              </th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.groups.map((g) => {
              const pct = (g.seconds / report.totalSeconds) * 100
              return (
                <tr key={g.key ?? `none-${g.label}`}>
                  <td className="max-w-64 px-3 py-2">
                    <p className="truncate font-medium">
                      {groupLabel === "Date"
                        ? formatDate(g.label, locale)
                        : g.label}
                    </p>
                    {g.detail ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {g.detail}
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-[4px] bg-muted/50">
                        <div
                          className="h-full rounded-r-[4px] bg-[var(--color-chart-3)] dark:bg-[var(--color-chart-2)]"
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatDuration(g.seconds)}
                  </td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
                    {amountText(g.amounts, locale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WeeklyView({
  report,
  locale,
  groupLabel,
}: {
  report: SummaryReport
  locale?: string
  groupLabel: string
}) {
  if (report.days.length > 31)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        The weekly view shows up to 31 days. Pick a shorter range.
      </p>
    )
  const head = new Intl.DateTimeFormat(locale ?? "en-US", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">
              {groupLabel}
            </th>
            {report.days.map((d) => (
              <th key={d} className="px-2 py-2 text-right font-medium">
                {head.format(new Date(`${d}T00:00:00Z`))}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {report.groups.map((g) => (
            <tr key={g.key ?? `none-${g.label}`}>
              <td className="sticky left-0 max-w-48 truncate bg-card px-3 py-2 font-medium">
                {g.label}
              </td>
              {g.byDay.map((sec, i) => (
                <td
                  key={report.days[i]}
                  className="px-2 py-2 text-right text-muted-foreground tabular-nums"
                >
                  {sec ? formatDuration(sec) : ""}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {formatDuration(g.seconds)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 text-xs font-medium">
            <td className="sticky left-0 bg-muted px-3 py-2">Total</td>
            {report.byDay.map((d) => (
              <td key={d.date} className="px-2 py-2 text-right tabular-nums">
                {d.seconds ? formatDuration(d.seconds) : ""}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums">
              {formatDuration(report.totalSeconds)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const col = columnsFor<TimeEntry>()

function DetailedView({
  filters,
  table,
  locale,
}: {
  filters: Record<string, unknown> & { from: string; to: string }
  table: ReturnType<typeof useDataTableState>
  locale?: string
}) {
  const report = useDetailedReport({
    ...filters,
    page: table.page,
    pageSize: table.pageSize,
    sort: table.sort,
  } as never)
  const time = new Intl.DateTimeFormat(locale ?? undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
  const columns = React.useMemo(
    () => [
      col.accessor("startedAt", {
        id: "date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        enableSorting: true,
        enableHiding: false,
        meta: { className: "whitespace-nowrap" },
        cell: ({ row }) => (
          <div>
            <p>{formatDate(row.original.entryDate, locale)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {time.format(new Date(row.original.startedAt))} –{" "}
              {row.original.endedAt
                ? time.format(new Date(row.original.endedAt))
                : "…"}
            </p>
          </div>
        ),
      }),
      col.accessor("description", {
        id: "description",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Description" />
        ),
        enableSorting: true,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="max-w-72 truncate">
              {row.original.description || (
                <span className="text-muted-foreground">No description</span>
              )}
            </p>
            <p className="truncate text-xs text-primary sm:hidden">
              {row.original.projectName}
            </p>
            {row.original.tags.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {row.original.tags.map((t) => (
                  <TagChip key={t.id} tag={t} />
                ))}
              </div>
            ) : null}
          </div>
        ),
      }),
      col.accessor("projectName", {
        id: "project",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Project" />
        ),
        enableSorting: true,
        meta: { label: "Project", hideBelow: "sm" },
        cell: ({ row }) =>
          row.original.projectName ? (
            <div className="min-w-0">
              <p className="max-w-56 truncate text-primary">
                {row.original.projectName}
                {row.original.taskTitle ? `: ${row.original.taskTitle}` : ""}
              </p>
              {row.original.clientName ? (
                <p className="truncate text-xs text-muted-foreground">
                  {row.original.clientName}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">No project</span>
          ),
      }),
      col.accessor("memberName", {
        id: "member",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Member" />
        ),
        enableSorting: true,
        meta: { label: "Member", hideBelow: "md" },
      }),
      col.accessor("billable", {
        header: "Billable",
        meta: {
          label: "Billable",
          hideBelow: "lg",
          className: "text-muted-foreground",
        },
        cell: ({ getValue }) => (getValue() ? "Yes" : "No"),
      }),
      col.accessor("durationSeconds", {
        id: "duration",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Duration" />
        ),
        enableSorting: true,
        enableHiding: false,
        meta: { align: "right", className: "font-medium tabular-nums" },
        cell: ({ getValue }) => formatDuration(getValue() ?? 0),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  )
  return (
    <div className="flex flex-col gap-3">
      {report.data ? (
        <p className="text-sm text-muted-foreground">
          {report.data.total} {report.data.total === 1 ? "entry" : "entries"} ·{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatDuration(report.data.totalSeconds)}
          </span>{" "}
          ({formatDuration(report.data.billableSeconds)} billable)
        </p>
      ) : null}
      <DataTable
        id="time-report"
        columns={columns}
        data={report.data?.items}
        total={report.data?.total}
        state={table}
        isLoading={report.isPending}
        error={report.error}
        empty={() => (
          <DataTableEmpty
            title="No matching time"
            description="No time entries match these filters. Try a wider range."
          />
        )}
      />
    </div>
  )
}
