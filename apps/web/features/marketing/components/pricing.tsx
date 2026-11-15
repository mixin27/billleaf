"use client"

import { useQuery } from "@tanstack/react-query"
import {
  type BillingInterval,
  FEATURE_LABELS,
  type FeatureKey,
  type LimitKey,
  PLANS,
  type PlanKey,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import * as React from "react"

import {
  IntervalTabs,
  limitText,
  pickInterval,
  priceIntervals,
} from "@/features/billing"
import { api, unwrap } from "@/lib/api"
import { money } from "@/lib/format"

const ORDER: PlanKey[] = ["free", "pro", "team"]
const LIMITS: LimitKey[] = [
  "members",
  "clients",
  "invoicesPerMonth",
  "storageMb",
]

const FAQ: { q: string; a: string }[] = [
  {
    q: "How do I pay for a plan?",
    a: "From Settings → Billing in your workspace: pay by bank transfer or mobile wallet to the account shown, then upload the screenshot. Your plan starts once we've matched the payment, and we email you when it has.",
  },
  {
    q: "Does it renew automatically?",
    a: "No. You pay for one or more months (or years) at a time. We remind you 7 days and 1 day before the end, and you can renew early — the time is added to your current period.",
  },
  {
    q: "What happens if I don't renew?",
    a: "Your plan keeps working for 7 more days, then the workspace moves to the Free plan's limits. Nothing is deleted; you just can't add more than the Free limits allow until you upgrade again.",
  },
  {
    q: "Can I take my data with me?",
    a: "Yes. Workspace owners can download every record as CSV files at any time, and delete the workspace for good.",
  },
]

type PriceRow = {
  planKey: "pro" | "team"
  interval: BillingInterval
  currency: string
  amount: number
}

function PlanPrice({
  planKey,
  price,
  interval,
  loading,
  soldOtherwise,
}: {
  planKey: PlanKey
  price: PriceRow | null
  interval: BillingInterval
  loading: boolean
  /** The plan has prices, just not for this period. */
  soldOtherwise: boolean
}) {
  if (planKey === "free") return <p className="text-2xl font-semibold">Free</p>
  if (loading) return <Skeleton className="h-8 w-32" />
  if (!price)
    return (
      <p className="text-sm text-muted-foreground">
        {soldOtherwise
          ? `Not offered ${interval === "year" ? "yearly" : "monthly"}.`
          : "Price shown in Settings → Billing after you sign up."}
      </p>
    )
  return (
    <p className="text-2xl font-semibold tabular-nums">
      {money(price.amount, price.currency)}
      <span className="text-sm font-normal text-muted-foreground">
        {` / ${interval}`}
      </span>
    </p>
  )
}

/** Plan cards for the public pricing page. Prices come from the API. */
export function Pricing({ signedIn = false }: { signedIn?: boolean }) {
  const pricing = useQuery({
    queryKey: ["public-pricing"],
    queryFn: () => unwrap(api.GET("/v1/billing/pricing")),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const [wanted, setInterval] = React.useState<BillingInterval>("month")
  const [currency, setCurrency] = React.useState<string | null>(null)
  const manual = pricing.data?.provider === "manual"
  // Manual billing: the admin-set prices. Other providers: the catalog's USD
  // prices. If prices can't be loaded, none are shown (never a guess).
  const prices: PriceRow[] = !pricing.data
    ? []
    : manual
      ? pricing.data.prices
      : (["pro", "team"] as const).flatMap((planKey) =>
          (["month", "year"] as const).flatMap((i) => {
            const amount = PLANS[planKey].prices?.[i]
            return amount
              ? [{ planKey, interval: i, currency: "USD", amount }]
              : []
          })
        )
  const currencies = [...new Set(prices.map((p) => p.currency))]
  const cur =
    currency && currencies.includes(currency)
      ? currency
      : (currencies[0] ?? null)
  const intervals = priceIntervals(prices, cur)
  const interval = pickInterval(intervals, wanted)
  const loading = pricing.isPending

  const priceOf = (key: PlanKey) =>
    prices.find(
      (x) => x.planKey === key && x.interval === interval && x.currency === cur
    ) ?? null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple pricing
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Start free. Upgrade when you need more clients, your own branding, or
          a team.
        </p>
      </div>

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

      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((key) => {
          const plan = PLANS[key]
          return (
            <div
              key={key}
              className={cn(
                "flex flex-col gap-4 rounded-lg border p-5",
                key === "pro" && "border-primary"
              )}
            >
              <div>
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>
              <PlanPrice
                planKey={key}
                price={priceOf(key)}
                interval={interval}
                loading={loading}
                soldOtherwise={prices.some(
                  (x) => x.planKey === key && x.currency === cur
                )}
              />
              <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                {LIMITS.map((k) => (
                  <li key={k}>{limitText(k, plan.limits[k])}</li>
                ))}
                {(Object.keys(plan.features) as FeatureKey[])
                  .filter((f) => plan.features[f])
                  .map((f) => (
                    <li key={f}>{FEATURE_LABELS[f]}</li>
                  ))}
              </ul>
              <Button
                variant={key === "pro" ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={signedIn ? "/app" : "/sign-up"} />}
              >
                {signedIn
                  ? "Open app"
                  : key === "free"
                    ? "Start free"
                    : `Start with ${plan.name}`}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Paid plans start from Settings → Billing after you sign up. Every plan
        includes the client portal, quotes, contracts, invoices, receipts and
        payment proofs.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Questions</h2>
        <dl className="grid gap-6 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
