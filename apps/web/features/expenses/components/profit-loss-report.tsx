"use client"

import type { ProfitLoss } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"

import { DateInput } from "@/components/form/date-input"
import { PageHeader } from "@/components/page-header"
import { docsUrl } from "@/lib/docs"
import { useWorkspaceProfile } from "@/features/workspace"
import { money } from "@/lib/format"

import { useProfitLoss } from "../api/queries"
import { useWorkspaceToday } from "./expenses-list"

const PRESETS = {
  this_year: "This year",
  last_year: "Last year",
  last_12: "Last 12 months",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom",
} as const
type Preset = keyof typeof PRESETS

const iso = (d: Date) => d.toISOString().slice(0, 10)

function range(p: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number) as [number, number]
  const first = (yy: number, mm: number) =>
    iso(new Date(Date.UTC(yy, mm - 1, 1)))
  const last = (yy: number, mm: number) => iso(new Date(Date.UTC(yy, mm, 0)))
  switch (p) {
    case "this_month":
      return { from: first(y, m), to: today }
    case "last_month":
      return { from: first(y, m - 1), to: last(y, m - 1) }
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case "last_12":
      return { from: first(y, m - 11), to: today }
    default:
      return { from: `${y}-01-01`, to: today }
  }
}

function monthLabel(ym: string, locale?: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number]
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

function csv(report: ProfitLoss) {
  const rows = [
    ["Month", "Currency", "Income", "Expenses", "Profit"],
    ...report.months.map((m) => [
      m.month,
      m.currency,
      String(m.income),
      String(m.expenses),
      String(m.profit),
    ]),
  ]
  return rows.map((r) => r.join(",")).join("\r\n")
}

/** Reports → Profit & loss: income vs expenses, categories, tax. */
export function ProfitLossReport() {
  const locale = useWorkspaceProfile().data?.locale
  const today = useWorkspaceToday()
  const [preset, setPreset] = useQueryState(
    "period",
    parseAsStringLiteral(Object.keys(PRESETS) as Preset[]).withDefault(
      "this_year"
    )
  )
  const [fromQ, setFrom] = useQueryState("from", parseAsString)
  const [toQ, setTo] = useQueryState("to", parseAsString)
  const r =
    preset === "custom" && fromQ && toQ
      ? { from: fromQ, to: toQ }
      : range(preset, today)
  const report = useProfitLoss(r.from, r.to)
  const data = report.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description={
          <>
            Profit & loss: money received minus money spent. Amounts aren&apos;t
            converted between currencies.{" "}
            <a
              className="underline"
              href={docsUrl("/docs/books/reports")}
              target="_blank"
              rel="noreferrer"
            >
              Learn more
            </a>
          </>
        }
        actions={
          data && data.months.length ? (
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([csv(data)], { type: "text/csv" })
                )
                const a = document.createElement("a")
                a.href = url
                a.download = `profit-loss-${r.from}-${r.to}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <Select
          items={PRESETS}
          value={preset}
          onValueChange={(v) => v && void setPreset(v as Preset)}
        >
          <SelectTrigger className="w-44" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRESETS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === "custom" ? (
          <>
            <DateInput
              aria-label="From"
              className="w-40"
              value={fromQ ?? r.from}
              onChange={(v) => void setFrom(v)}
              required
            />
            <DateInput
              aria-label="To"
              className="w-40"
              value={toQ ?? r.to}
              onChange={(v) => void setTo(v)}
              required
            />
          </>
        ) : (
          <span className="pb-2 text-sm text-muted-foreground">
            {r.from} – {r.to}
          </span>
        )}
      </div>

      {report.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : report.error ? (
        <p className="text-sm text-destructive">{report.error.message}</p>
      ) : !data || data.months.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payments or expenses in this period.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.totals.map((t) => (
              <Card key={t.currency} size="sm" className="sm:col-span-3">
                <CardContent className="grid grid-cols-3 gap-3">
                  {[
                    ["Income", t.income],
                    ["Expenses", t.expenses],
                    ["Profit", t.amount],
                  ].map(([label, v]) => (
                    <div key={label as string}>
                      <p className="text-xs text-muted-foreground">
                        {label} · {t.currency}
                      </p>
                      <p
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          label === "Profit" &&
                            (v as number) < 0 &&
                            "text-destructive"
                        )}
                      >
                        {money(v as number, t.currency, locale)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By month</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Month</th>
                    <th className="py-2 text-right font-medium">Income</th>
                    <th className="py-2 text-right font-medium">Expenses</th>
                    <th className="py-2 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.months.map((m) => (
                    <tr key={`${m.month}-${m.currency}`}>
                      <td className="py-2">
                        {monthLabel(m.month, locale)}
                        {data.totals.length > 1 ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {m.currency}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(m.income, m.currency, locale)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {money(m.expenses, m.currency, locale)}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-medium tabular-nums",
                          m.profit < 0 && "text-destructive"
                        )}
                      >
                        {money(m.profit, m.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Expenses by category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses.</p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {data.byCategory.map((c) => {
                      const total =
                        data.totals.find((t) => t.currency === c.currency)
                          ?.expenses ?? 0
                      const pct = total ? (c.amount / total) * 100 : 0
                      return (
                        <li key={`${c.categoryId}-${c.currency}`}>
                          <div className="flex justify-between gap-2">
                            <span className="truncate">{c.name}</span>
                            <span className="tabular-nums">
                              {money(c.amount, c.currency, locale)} ·{" "}
                              {Math.round(pct)}%
                            </span>
                          </div>
                          <div
                            className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                            aria-hidden
                          >
                            <div
                              className="h-full rounded-full bg-[var(--color-chart-3)]"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tax summary</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {data.tax.length === 0 ? (
                  <p className="text-muted-foreground">
                    No tax on issued invoices or recorded expenses.
                  </p>
                ) : (
                  data.tax.map((t) => (
                    <dl key={t.currency} className="grid grid-cols-3 gap-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Charged on invoices
                        </dt>
                        <dd className="tabular-nums">
                          {money(t.collected, t.currency, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Paid on expenses
                        </dt>
                        <dd className="tabular-nums">
                          {money(t.paid, t.currency, locale)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Difference
                        </dt>
                        <dd className="font-medium tabular-nums">
                          {money(t.collected - t.paid, t.currency, locale)}
                        </dd>
                      </div>
                    </dl>
                  ))
                )}
                <p className="text-xs text-muted-foreground">
                  Tax on invoices issued in the period, and the tax part of
                  expenses. A guide for your accountant, not a tax return.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
