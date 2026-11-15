"use client"

import {
  AGING_LABELS,
  type Dashboard as DashboardData,
  PAYMENT_METHOD_LABELS,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import Link from "next/link"
import * as React from "react"

import { Can } from "@/components/permissions/can"
import {
  useMe,
  useWorkspaceProfile,
  useWorkspaceStore,
} from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useDashboard } from "../api"
import { BarList, ColumnChart } from "./bar-charts"
import { StatTile } from "./stat-tile"
import { PageHeader } from "@/components/page-header"
import { WeekTimeCard } from "@/features/time"

type Amounts = { currency: string; amount: number }[]

export function Dashboard() {
  const dashboard = useDashboard()
  const me = useMe()
  const locale = useWorkspaceProfile().data?.locale
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const fmtAll = (rows: Amounts) =>
    rows.map((r) => money(r.amount, r.currency, locale))

  if (dashboard.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }
  if (dashboard.error)
    return <p className="text-sm text-destructive">{dashboard.error.message}</p>
  const d = dashboard.data
  const base = `/${slug}`
  const isEmpty =
    (d.receivables?.totals.length ?? 0) === 0 &&
    (d.received?.thisMonth.length ?? 0) === 0 &&
    (d.received?.recent.length ?? 0) === 0 &&
    (d.quotes?.open.length ?? 0) === 0 &&
    (d.receivables?.draftCount ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          me.data ? `Welcome back, ${me.data.user.name.split(" ")[0]}` : "Home"
        }
        breadcrumb={null}
        description={formatDate(d.today, locale)}
        actions={
          <>
            <Can permission="quote.create">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`${base}/quotes/new`} />}
              >
                New quote
              </Button>
            </Can>
            <Can permission="invoice.create">
              <Button
                nativeButton={false}
                render={<Link href={`${base}/invoices/new`} />}
              >
                New invoice
              </Button>
            </Can>
          </>
        }
      />

      {isEmpty ? <GettingStarted base={base} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {d.receivables ? (
          <>
            <StatTile
              label="Outstanding"
              values={d.receivables.totals.map((t) =>
                money(t.outstanding, t.currency, locale)
              )}
              hint={`${d.receivables.totals.reduce((n, t) => n + t.openCount, 0)} unpaid invoices`}
              href={`${base}/invoices?status=open`}
            />
            <StatTile
              label="Overdue"
              tone="critical"
              values={d.receivables.totals
                .filter((t) => t.overdue > 0)
                .map((t) => money(t.overdue, t.currency, locale))}
              hint={
                d.receivables.totals.some((t) => t.overdueCount > 0)
                  ? `${d.receivables.totals.reduce((n, t) => n + t.overdueCount, 0)} invoices past due`
                  : "Nothing overdue"
              }
              href={`${base}/invoices?status=overdue`}
            />
          </>
        ) : null}
        {d.received ? (
          <StatTile
            label="Received this month"
            values={fmtAll(d.received.thisMonth)}
            hint={
              <MonthComparison
                thisMonth={d.received.thisMonth}
                lastMonth={d.received.lastMonth}
                primary={d.primaryCurrency}
                locale={locale}
              />
            }
            href={`${base}/payments`}
          />
        ) : null}
        {d.quotes ? (
          <StatTile
            label="Open quotes"
            values={fmtAll(d.quotes.open)}
            hint={
              d.quotes.expiringSoonCount > 0
                ? `${d.quotes.expiringSoonCount} expiring within 7 days`
                : `${d.quotes.acceptedThisMonth.reduce((n, q) => n + q.count, 0)} accepted this month`
            }
            href={`${base}/quotes?status=sent`}
          />
        ) : null}
      </div>

      <Can permission="time.track">
        <WeekTimeCard today={d.today} />
      </Can>

      {d.receivables && d.receivables.draftCount > 0 ? (
        <p className="text-sm">
          <Link className="underline" href={`${base}/invoices?status=draft`}>
            {d.receivables.draftCount} draft{" "}
            {d.receivables.draftCount === 1 ? "invoice" : "invoices"}
          </Link>{" "}
          waiting to be issued.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {d.received ? <RevenueCard data={d} locale={locale} /> : null}
        {d.receivables ? <AgingCard data={d} locale={locale} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {d.receivables ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most overdue</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {d.receivables.overdueInvoices.length === 0 ? (
                <p className="text-muted-foreground">No overdue invoices. 🎉</p>
              ) : (
                d.receivables.overdueInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`${base}/invoices/${inv.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{inv.number}</span>{" "}
                      <span className="text-muted-foreground">
                        {inv.clientName}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">
                        {money(inv.amountDue, inv.currency, locale)}
                      </span>
                      <Badge variant="destructive">
                        {inv.daysOverdue}d late
                      </Badge>
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
        {d.received ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {d.received.recent.length === 0 ? (
                <p className="text-muted-foreground">
                  No payments recorded yet.
                </p>
              ) : (
                d.received.recent.map((p) => (
                  <Link
                    key={p.id}
                    href={`${base}/invoices/${p.invoiceId}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{p.clientName}</span>{" "}
                      <span className="text-muted-foreground">
                        {formatDate(p.paidOn, locale)} ·{" "}
                        {PAYMENT_METHOD_LABELS[p.method]} · {p.receiptNumber}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {money(p.amount, p.currency, locale)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function MonthComparison({
  thisMonth,
  lastMonth,
  primary,
  locale,
}: {
  thisMonth: Amounts
  lastMonth: Amounts
  primary: string
  locale?: string
}) {
  const cur = thisMonth[0]?.currency ?? primary
  const now = thisMonth.find((r) => r.currency === cur)?.amount ?? 0
  const prev = lastMonth.find((r) => r.currency === cur)?.amount ?? 0
  if (prev === 0) return <>Last month: {money(0, cur, locale)}</>
  const pct = Math.round(((now - prev) / prev) * 100)
  return (
    <>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs last month (
      {money(prev, cur, locale)})
    </>
  )
}

function CurrencyTabs({
  currencies,
  value,
  onChange,
}: {
  currencies: string[]
  value: string
  onChange: (c: string) => void
}) {
  if (currencies.length < 2) return null
  return (
    <Tabs value={value} onValueChange={(v) => onChange(String(v))}>
      <TabsList>
        {currencies.map((c) => (
          <TabsTrigger key={c} value={c}>
            {c}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function RevenueCard({
  data,
  locale,
}: {
  data: DashboardData
  locale?: string
}) {
  const monthly = data.received!.monthly
  const [currency, setCurrency] = React.useState(
    monthly[0]?.currency ?? data.primaryCurrency
  )
  const series = monthly.find((m) => m.currency === currency) ?? monthly[0]
  const months = series?.months ?? []
  const label = (m: string) =>
    new Intl.DateTimeFormat(locale ?? "en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${m}-01T00:00:00Z`))
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          Payments received · last 6 months
        </CardTitle>
        <CurrencyTabs
          currencies={monthly.map((m) => m.currency)}
          value={currency}
          onChange={setCurrency}
        />
      </CardHeader>
      <CardContent>
        {months.length === 0 || months.every((m) => m.amount === 0) ? (
          <p className="text-sm text-muted-foreground">
            Payments you record will show up here.
          </p>
        ) : (
          <ColumnChart
            caption={`Payments received per month in ${series!.currency}`}
            data={months.map((m) => ({
              key: m.month,
              label: label(m.month),
              value: m.amount,
              display: money(m.amount, series!.currency, locale),
            }))}
          />
        )}
      </CardContent>
    </Card>
  )
}

function AgingCard({ data, locale }: { data: DashboardData; locale?: string }) {
  const aging = data.receivables!.aging
  const [currency, setCurrency] = React.useState(
    aging[0]?.currency ?? data.primaryCurrency
  )
  const series = aging.find((a) => a.currency === currency) ?? aging[0]
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Outstanding by age</CardTitle>
        <CurrencyTabs
          currencies={aging.map((a) => a.currency)}
          value={currency}
          onChange={setCurrency}
        />
      </CardHeader>
      <CardContent>
        {!series ? (
          <p className="text-sm text-muted-foreground">No unpaid invoices.</p>
        ) : (
          <BarList
            caption={`Unpaid invoice balances by days overdue in ${series.currency}`}
            data={series.buckets.map((b) => ({
              key: b.bucket,
              label: AGING_LABELS[b.bucket],
              value: b.amount,
              display: money(b.amount, series.currency, locale),
            }))}
          />
        )}
      </CardContent>
    </Card>
  )
}

function GettingStarted({ base }: { base: string }) {
  const steps = [
    {
      title: "Complete your business profile",
      body: "Address, tax ID and currency appear on every document.",
      href: `${base}/settings/general`,
    },
    {
      title: "Add your first client",
      body: "Their details flow into quotes and invoices.",
      href: `${base}/clients`,
    },
    {
      title: "Send a quote or invoice",
      body: "Issue it, email the PDF, then record the payment.",
      href: `${base}/invoices/new`,
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Get started</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border p-4 hover:bg-muted"
          >
            <p className="text-xs text-muted-foreground">Step {i + 1}</p>
            <p className="font-medium">{s.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.body}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
