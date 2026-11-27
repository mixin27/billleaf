"use client"

import type { Cashbook, CashbookReport } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import * as React from "react"
import { toast } from "sonner"

import { DataTableSelectFilter } from "@/components/data-table"
import { DateInput } from "@/components/form/date-input"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { downloadCashbookFile, useCashbookReport } from "../api/queries"
import { type Duration, DURATIONS } from "../lib"
import { useBookFilterState } from "./book-entries"
import { Signed } from "./signed"

const VIEWS = [
  { value: "day", label: "Day-wise" },
  { value: "category", label: "Category-wise" },
  { value: "mode", label: "Payment mode-wise" },
] as const

/**
 * Summaries for the same filters as the Entries tab (shared via the URL),
 * and the CSV and PDF statement downloads.
 */
export function BookReports({
  book,
  today,
}: {
  book: Cashbook
  today: string
}) {
  const locale = useWorkspaceProfile().data?.locale
  const { f, setF, filter } = useBookFilterState(today)
  const query = filter()
  const report = useCashbookReport(book.id, query)
  const [view, setView] = React.useState<(typeof VIEWS)[number]["value"]>("day")
  const [busy, setBusy] = React.useState<"csv" | "pdf" | null>(null)
  const m = (n: number) => money(n, book.currency, locale)
  const r = report.data
  const otherFilters = [f.type, f.category, f.mode, f.member].filter(
    Boolean
  ).length

  const download = async (kind: "csv" | "pdf") => {
    setBusy(kind)
    try {
      await downloadCashbookFile(book, query, kind)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DataTableSelectFilter<Duration>
          title="Duration"
          value={f.duration === "all" ? null : f.duration}
          options={DURATIONS.filter((d) => d.value !== "all").map((d) => ({
            value: d.value,
            label: d.label,
          }))}
          onChange={(v) =>
            void setF({
              duration: v,
              ...(v === "custom" ? {} : { from: null, to: null }),
            })
          }
        />
        {f.duration === "custom" ? (
          <span className="flex items-center gap-1">
            <DateInput
              aria-label="From"
              value={f.from}
              onChange={(v) => void setF({ from: v || null })}
            />
            <span className="text-muted-foreground">–</span>
            <DateInput
              aria-label="To"
              value={f.to}
              onChange={(v) => void setF({ to: v || null })}
            />
          </span>
        ) : null}
        {otherFilters ? (
          <span className="text-xs text-muted-foreground">
            + {otherFilters} filter{otherFilters > 1 ? "s" : ""} from Entries
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void download("csv")}
          >
            {busy === "csv" ? "Preparing…" : "Download CSV"}
          </Button>
          <Button disabled={busy !== null} onClick={() => void download("pdf")}>
            {busy === "pdf" ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {report.error ? (
        <p className="text-sm text-destructive">{errorMessage(report.error)}</p>
      ) : !r ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <dl className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-4">
            <Fact
              label={
                r.from
                  ? `Opening, ${formatDate(r.from, locale)}`
                  : "Opening balance"
              }
            >
              {m(r.openingBalance)}
            </Fact>
            <Fact label="Total in (+)">
              <Signed>{m(r.totalIn)}</Signed>
            </Fact>
            <Fact label="Total out (−)">
              <Signed out>{m(r.totalOut)}</Signed>
            </Fact>
            <Fact
              label={
                r.to
                  ? `Closing, ${formatDate(r.to, locale)}`
                  : "Closing balance"
              }
            >
              <Signed value={r.closingBalance}>{m(r.closingBalance)}</Signed>
            </Fact>
          </dl>

          <Tabs value={view} onValueChange={(v) => setView(v as never)}>
            <TabsList>
              {VIEWS.map((v) => (
                <TabsTrigger key={v.value} value={v.value}>
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <SummaryTable report={r} view={view} money={m} locale={locale} />
        </>
      )}
    </div>
  )
}

function Fact({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

function SummaryTable({
  report: r,
  view,
  money: m,
  locale,
}: {
  report: CashbookReport
  view: (typeof VIEWS)[number]["value"]
  money: (n: number) => string
  locale?: string
}) {
  const rows =
    view === "day"
      ? r.byDay.map((d) => ({
          key: d.date,
          name: formatDate(d.date, locale),
          totalIn: d.totalIn,
          totalOut: d.totalOut,
          last: d.balance,
        }))
      : (view === "category" ? r.byCategory : r.byMode).map((g) => ({
          key: g.id ?? "none",
          name: g.name,
          totalIn: g.totalIn,
          totalOut: g.totalOut,
          last: g.totalIn - g.totalOut,
        }))
  if (!rows.length)
    return (
      <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
        No entries in this range.
      </p>
    )
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {view === "day"
                ? "Date"
                : view === "category"
                  ? "Category"
                  : "Payment mode"}
            </TableHead>
            <TableHead className="text-right">Cash in</TableHead>
            <TableHead className="text-right">Cash out</TableHead>
            <TableHead className="text-right">
              {view === "day" ? "Balance" : "Net"}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{row.name}</TableCell>
              <TableCell className="text-right">
                {row.totalIn ? <Signed>{m(row.totalIn)}</Signed> : "—"}
              </TableCell>
              <TableCell className="text-right">
                {row.totalOut ? <Signed out>{m(row.totalOut)}</Signed> : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {m(row.last)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
