"use client"

import {
  type BillingInterval,
  type BillingOverview,
  FEATURE_LABELS,
  type FeatureKey,
  type PaidPlanKey,
  PLANS,
  type PlatformPrice,
  type SubscriptionPayment,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import * as React from "react"

import { useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import {
  useManualBillingOptions,
  useSubscriptionPayments,
} from "../api/queries"

const PAID: PaidPlanKey[] = ["pro", "team"]

export const PAYMENT_STATUS: Record<
  SubscriptionPayment["status"],
  { label: string; variant: "secondary" | "default" | "destructive" }
> = {
  pending: { label: "Waiting for approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Not approved", variant: "destructive" },
}

export function periodLabel(
  p: Pick<SubscriptionPayment, "periods" | "interval">
) {
  const unit = p.interval === "year" ? "year" : "month"
  return `${p.periods} ${unit}${p.periods === 1 ? "" : "s"}`
}

/** Currencies that have at least one active price, most common first. */
export function priceCurrencies(prices: PlatformPrice[]) {
  return [...new Set(prices.map((p) => p.currency))]
}

const INTERVAL_ORDER: BillingInterval[] = ["month", "year"]
const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
}

/** Billing periods that have at least one price (in `currency`), month first. */
export function priceIntervals(
  prices: Pick<PlatformPrice, "interval" | "currency">[],
  currency?: string | null
): BillingInterval[] {
  return INTERVAL_ORDER.filter((i) =>
    prices.some(
      (p) => p.interval === i && (!currency || p.currency === currency)
    )
  )
}

/** `wanted` if it has prices, else the first period that does. */
export function pickInterval(
  intervals: BillingInterval[],
  wanted: BillingInterval
): BillingInterval {
  return intervals.includes(wanted) ? wanted : (intervals[0] ?? wanted)
}

/** Monthly / Yearly switch, shown only when both have prices. */
export function IntervalTabs({
  intervals,
  value,
  onChange,
}: {
  intervals: BillingInterval[]
  value: BillingInterval
  onChange: (v: BillingInterval) => void
}) {
  if (intervals.length < 2) return null
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as BillingInterval)}>
      <TabsList>
        {intervals.map((i) => (
          <TabsTrigger key={i} value={i}>
            {INTERVAL_LABELS[i]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/**
 * Settings → Billing when Billleaf is paid manually (ADR-0013): admin-set
 * prices, "Pay for …" → the pay page, the request waiting for approval, and
 * past payments.
 */
export function ManualPlans({
  billing,
  canManage,
}: {
  billing: BillingOverview
  canManage: boolean
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const options = useManualBillingOptions()
  const history = useSubscriptionPayments()
  const [wanted, setInterval] = React.useState<BillingInterval>(
    billing.interval ?? "month"
  )
  const currencies = priceCurrencies(options.data?.prices ?? [])
  const [currency, setCurrency] = React.useState<string | null>(null)
  const cur = currency ?? currencies[0] ?? null

  if (options.isPending) return <Skeleton className="h-64 w-full" />
  if (options.error)
    return <p className="text-sm text-destructive">{options.error.message}</p>
  const { prices, pending } = options.data
  const current = billing.effectivePlanKey
  const intervals = priceIntervals(prices, cur)
  const interval = pickInterval(intervals, wanted)

  return (
    <div className="flex flex-col gap-8">
      {pending ? (
        <Card className="border-primary/40">
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge variant="secondary">Waiting for approval</Badge>
            <span>
              {PLANS[pending.planKey].name} for {periodLabel(pending)} ·{" "}
              {money(pending.amount, pending.currency)} paid{" "}
              {formatDate(pending.paidOn)}
            </span>
            <span className="w-full text-muted-foreground">
              We&apos;ll email you once it&apos;s checked.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Plans</h2>
          <div className="flex flex-wrap gap-2">
            {currencies.length > 1 ? (
              <Tabs value={cur ?? ""} onValueChange={(v) => setCurrency(v)}>
                <TabsList>
                  {currencies.map((c) => (
                    <TabsTrigger key={c} value={c}>
                      {c}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : null}
            <IntervalTabs
              intervals={intervals}
              value={interval}
              onChange={setInterval}
            />
          </div>
        </div>
        {prices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Paid plans aren&apos;t open yet. Contact support to upgrade.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {PAID.map((key) => {
            const plan = PLANS[key]
            const price = prices.find(
              (p) =>
                p.planKey === key &&
                p.interval === interval &&
                p.currency === cur
            )
            const renew = key === current
            const href = `/${slug}/settings/billing/pay?plan=${key}&interval=${interval}${cur ? `&currency=${cur}` : ""}`
            return (
              <div
                key={key}
                className={cn(
                  "flex flex-col gap-4 rounded-lg border p-4",
                  renew && "border-primary"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {renew ? <Badge variant="outline">Current</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>
                {price ? (
                  <p className="text-2xl font-semibold tabular-nums">
                    {money(price.amount, price.currency)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {` / ${interval}`}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not available {interval === "year" ? "yearly" : "monthly"}
                    {cur ? ` in ${cur}` : ""} yet.
                  </p>
                )}
                <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                  {(Object.keys(plan.features) as FeatureKey[])
                    .filter((f) => plan.features[f])
                    .map((f) => (
                      <li key={f}>{FEATURE_LABELS[f]}</li>
                    ))}
                </ul>
                {canManage && price && !pending ? (
                  <Button nativeButton={false} render={<Link href={href} />}>
                    {renew ? `Renew ${plan.name}` : `Pay for ${plan.name}`}
                  </Button>
                ) : (
                  <Button disabled>
                    {renew ? `Renew ${plan.name}` : `Pay for ${plan.name}`}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Pay by bank transfer or mobile wallet and upload a screenshot. Your
          plan starts (or is extended) once we approve it. Paying early adds to
          your current period. When a plan ends, nothing is deleted.
        </p>
        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            Only members who can manage billing can pay for a plan.
          </p>
        ) : null}
      </section>

      {history.data?.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Payments</h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {history.data.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {PLANS[p.planKey].name} · {periodLabel(p)}
                  </span>
                  <span className="tabular-nums">
                    {money(p.amount, p.currency)}
                  </span>
                  <Badge variant={PAYMENT_STATUS[p.status].variant}>
                    {PAYMENT_STATUS[p.status].label}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  Paid {formatDate(p.paidOn)}
                  {p.paymentAccountLabel ? ` by ${p.paymentAccountLabel}` : ""}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                  {p.status === "approved" && p.periodEnd
                    ? ` · covers until ${formatDate(p.periodEnd)}`
                    : ""}
                </p>
                {p.status === "rejected" && p.rejectionReason ? (
                  <p className="text-muted-foreground">“{p.rejectionReason}”</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
