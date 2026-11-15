"use client"

import {
  type BillingInterval,
  type BillingOverview,
  FEATURE_LABELS,
  type FeatureKey,
  LIMIT_LABELS,
  type LimitKey,
  type PaidPlanKey,
  PLANS,
  type PlanKey,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useChangePlan, useCheckout, usePortal } from "../api/mutations"
import { useBillingOverview } from "../api/queries"
import { ManualPlans } from "./manual-billing"

const ORDER: PlanKey[] = ["free", "pro", "team"]
const METER_LABELS: Record<LimitKey, string> = {
  members: "Members",
  clients: "Active clients",
  invoicesPerMonth: "Invoices issued this month",
  storageMb: "File storage (MB)",
}
const LIMITS: LimitKey[] = [
  "members",
  "clients",
  "invoicesPerMonth",
  "storageMb",
]

/** "1 member", "5 active clients", "5 GB of file storage", "Unlimited …". */
function limitText(key: LimitKey, max: number | null) {
  if (max === null)
    return key === "storageMb"
      ? "Unlimited file storage"
      : `Unlimited ${LIMIT_LABELS[key]}`
  if (key === "storageMb")
    return max >= 1000
      ? `${max / 1000} GB of file storage`
      : `${max} MB of file storage`
  if (key === "members") return max === 1 ? "1 member" : `${max} members`
  return `${max} ${LIMIT_LABELS[key]}`
}

function StatusLine({ b, locale }: { b: BillingOverview; locale?: string }) {
  const end = formatDate(b.currentPeriodEnd, locale)
  if (b.effectivePlanKey === "free" && b.planKey !== "free")
    return <>Your {PLANS[b.planKey].name} subscription has ended.</>
  if (b.planKey === "free") return <>You&apos;re on the Free plan.</>
  if (b.provider === "manual" || b.graceEndsAt) {
    if (
      b.graceEndsAt &&
      new Date(b.graceEndsAt) > new Date() &&
      b.currentPeriodEnd &&
      new Date(b.currentPeriodEnd) < new Date()
    )
      return (
        <>
          Ended on {end}. {PLANS[b.planKey].name} keeps working until{" "}
          {formatDate(b.graceEndsAt, locale)}; renew to keep it.
        </>
      )
    return b.currentPeriodEnd ? (
      <>Paid until {end}.</>
    ) : (
      <>{PLANS[b.planKey].name} with no end date.</>
    )
  }
  if (b.status === "past_due")
    return (
      <>
        We couldn&apos;t take your last payment. Update your payment method to
        keep {PLANS[b.planKey].name}.
      </>
    )
  if (b.cancelAtPeriodEnd)
    return (
      <>
        Cancels on {end}. You keep {PLANS[b.planKey].name} until then.
      </>
    )
  return (
    <>
      Renews {b.interval === "year" ? "yearly" : "monthly"} on {end}.
    </>
  )
}

function Meter({
  label,
  used,
  max,
}: {
  label: string
  used: number
  max: number | null
}) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0
  const full = max !== null && used >= max
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {used}
          {max === null ? " · unlimited" : ` of ${max}`}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max ?? undefined}
        aria-valuenow={used}
      >
        <div
          className={cn(
            "h-full rounded-full",
            full ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${max === null ? 0 : pct}%` }}
        />
      </div>
    </div>
  )
}

export function BillingSettings() {
  const billing = useBillingOverview()
  const locale = useWorkspaceProfile().data?.locale
  const { can } = usePermissions()
  const checkout = useCheckout()
  const change = useChangePlan()
  const portal = usePortal()
  const [interval, setInterval] = React.useState<BillingInterval>("month")
  React.useEffect(() => {
    if (billing.data?.interval) setInterval(billing.data.interval)
  }, [billing.data?.interval])

  if (billing.isPending) return <Skeleton className="h-96 w-full" />
  if (billing.error)
    return <p className="text-sm text-destructive">{billing.error.message}</p>
  const b = billing.data
  const current = b.effectivePlanKey
  const subscribed =
    b.canManage && b.planKey !== "free" && b.status !== "canceled"
  const manage = can("billing.manage")
  const busy = checkout.isPending || change.isPending || portal.isPending

  const choose = (planKey: PaidPlanKey) => {
    const onError = (e: unknown) => toast.error(errorMessage(e))
    if (subscribed)
      change.mutate(
        { planKey, interval },
        {
          onSuccess: () => toast.success(`Switched to ${PLANS[planKey].name}`),
          onError,
        }
      )
    else checkout.mutate({ planKey, interval }, { onError })
  }

  return (
    <div className="flex flex-col gap-8">
      {b.provider === "test" ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Test billing: checkout and the billing portal are simulated and no
          payment is taken.
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-lg border p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {PLANS[current].name} plan
              </h2>
              {b.status === "past_due" ? (
                <Badge variant="destructive">Payment failed</Badge>
              ) : b.provider === "manual" ? null : b.cancelAtPeriodEnd &&
                current !== "free" ? (
                <Badge variant="secondary">Cancels soon</Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              <StatusLine b={b} locale={locale} />
            </p>
          </div>
          {manage && b.canManage ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                portal.mutate(undefined, {
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Manage billing
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {LIMITS.map((k) => (
            <Meter
              key={k}
              label={METER_LABELS[k]}
              used={b.usage[k]}
              max={PLANS[current].limits[k]}
            />
          ))}
        </div>
      </section>

      {b.provider === "manual" ? (
        <ManualPlans billing={b} canManage={manage} />
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Plans</h2>
            <Tabs
              value={interval}
              onValueChange={(v) => setInterval(v as BillingInterval)}
            >
              <TabsList>
                <TabsTrigger value="month">Monthly</TabsTrigger>
                <TabsTrigger value="year">Yearly · 2 months free</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {!b.checkoutAvailable ? (
            <p className="text-sm text-muted-foreground">
              Online upgrades aren&apos;t available yet. Contact support to
              change your plan.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            {ORDER.map((key) => {
              const plan = PLANS[key]
              const isCurrent =
                key === current &&
                (key === "free" || !subscribed || b.interval === interval)
              const price = plan.prices?.[interval]
              return (
                <div
                  key={key}
                  className={cn(
                    "flex flex-col gap-4 rounded-lg border p-4",
                    key === current && "border-primary"
                  )}
                >
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {price ? money(price, "USD", "en-US") : "$0"}
                    <span className="text-sm font-normal text-muted-foreground">
                      {price ? ` / ${interval}` : " forever"}
                    </span>
                  </p>
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
                  {key === "free" ? (
                    <Button variant="outline" disabled>
                      {current === "free" ? "Current plan" : "Included"}
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="outline" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      disabled={!manage || !b.checkoutAvailable || busy}
                      onClick={() => choose(key)}
                    >
                      {subscribed
                        ? `Switch to ${plan.name}`
                        : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {subscribed ? (
            <p className="text-xs text-muted-foreground">
              To cancel or move to Free, use Manage billing. Downgrading never
              deletes data; anything over the new limits becomes read-only for
              new additions.
            </p>
          ) : null}
          {!manage ? (
            <p className="text-xs text-muted-foreground">
              Only members who can manage billing can change the plan.
            </p>
          ) : null}
        </section>
      )}
    </div>
  )
}
