"use client"

import {
  type BillingInterval,
  type PaidPlanKey,
  PLANS,
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
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { Field } from "@/components/form/field"
import { PageHeader } from "@/components/page-header"
import { HowToPay } from "@/features/portal"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useSubmitSubscriptionPayment } from "../api/mutations"
import { useManualBillingOptions } from "../api/queries"
import {
  periodLabel,
  pickInterval,
  priceCurrencies,
  priceIntervals,
} from "./manual-billing"

const MAX_BYTES = 2 * 1024 * 1024
const NONE = "__none__"
const PERIODS: Record<BillingInterval, number[]> = {
  month: [1, 2, 3, 6, 12],
  year: [1, 2],
}

/** Settings → Billing → Pay: pay Billleaf for a plan and upload proof. */
export function SubscriptionPay() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { can } = usePermissions()
  const options = useManualBillingOptions()
  const submit = useSubmitSubscriptionPayment()
  const [plan, setPlan] = useQueryState(
    "plan",
    parseAsStringLiteral(["pro", "team"] as const).withDefault("pro")
  )
  const [wantedInterval, setInterval] = useQueryState(
    "interval",
    parseAsStringLiteral(["month", "year"] as const).withDefault("month")
  )
  const [currencyParam, setCurrency] = useQueryState("currency", parseAsString)
  const today = new Date().toISOString().slice(0, 10)
  const [periods, setPeriods] = React.useState(1)
  const [paidOn, setPaidOn] = React.useState(today)
  const [account, setAccount] = React.useState(NONE)
  const [reference, setReference] = React.useState("")
  const [note, setNote] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)

  const back = `/${slug}/settings/billing`
  if (options.isPending) return <Skeleton className="h-96 w-full" />
  if (options.error)
    return <p className="text-sm text-destructive">{options.error.message}</p>
  const { prices, accounts, pending } = options.data
  const currencies = priceCurrencies(prices)
  const currency =
    currencyParam && currencies.includes(currencyParam)
      ? currencyParam
      : currencies[0]
  // Only periods this plan is sold for in this currency.
  const intervals = priceIntervals(
    prices.filter((p) => p.planKey === plan),
    currency
  )
  const interval = pickInterval(intervals, wantedInterval)
  const price = prices.find(
    (p) =>
      p.planKey === plan && p.interval === interval && p.currency === currency
  )
  const usable = accounts.filter(
    (a) =>
      !currency || a.currencies.length === 0 || a.currencies.includes(currency)
  )
  const header = (
    <PageHeader
      title="Pay for your plan"
      description="Pay by bank transfer or mobile wallet, then upload the screenshot. Your plan starts once it's approved."
      actions={
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={back} />}
        >
          Back to billing
        </Button>
      }
    />
  )

  if (!can("billing.manage"))
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">
          Only members who can manage billing can pay for a plan.
        </p>
      </div>
    )
  if (pending)
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardContent className="text-sm">
            Your payment for {PLANS[pending.planKey].name} (
            {periodLabel(pending)}, {money(pending.amount, pending.currency)},
            paid {formatDate(pending.paidOn)}) is waiting for approval. You can
            pay again once it&apos;s been checked.
          </CardContent>
        </Card>
      </div>
    )

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Plan" htmlFor="pay-plan">
            <Select
              items={{ pro: PLANS.pro.name, team: PLANS.team.name }}
              value={plan}
              onValueChange={(v) => void setPlan(v as PaidPlanKey)}
            >
              <SelectTrigger id="pay-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">{PLANS.pro.name}</SelectItem>
                <SelectItem value="team">{PLANS.team.name}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {intervals.length > 1 ? (
            <Field label="Billing period" htmlFor="pay-interval">
              <Select
                items={{ month: "Monthly", year: "Yearly" }}
                value={interval}
                onValueChange={(v) => {
                  void setInterval(v as BillingInterval)
                  setPeriods(1)
                }}
              >
                <SelectTrigger id="pay-interval" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {intervals.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i === "year" ? "Yearly" : "Monthly"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="How many" htmlFor="pay-periods">
            <Select
              items={Object.fromEntries(
                PERIODS[interval].map((n) => [
                  String(n),
                  periodLabel({ periods: n, interval }),
                ])
              )}
              value={String(periods)}
              onValueChange={(v) => setPeriods(Number(v))}
            >
              <SelectTrigger id="pay-periods" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS[interval].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {periodLabel({ periods: n, interval })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {currencies.length > 1 ? (
            <Field label="Currency" htmlFor="pay-currency">
              <Select
                items={Object.fromEntries(currencies.map((c) => [c, c]))}
                value={currency}
                onValueChange={(v) => void setCurrency(v as string)}
              >
                <SelectTrigger id="pay-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <div className="sm:col-span-2 lg:col-span-4">
            {price ? (
              <p className="text-sm">
                Amount to pay:{" "}
                <span className="text-xl font-semibold tabular-nums">
                  {money(price.amount * periods, price.currency)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-destructive">
                This plan isn&apos;t available for this period or currency.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <HowToPay accounts={usable} />

      <Card className="border-primary/40">
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!price || !currency) return
              if (!file) return void toast.error("Attach a screenshot")
              submit.mutate(
                {
                  planKey: plan,
                  interval,
                  currency,
                  periods,
                  paidOn,
                  platformPaymentAccountId:
                    account === NONE ? undefined : account,
                  reference,
                  note,
                  file,
                },
                {
                  onSuccess: () => {
                    toast.success("Thanks! We'll email you once it's approved.")
                    router.push(back)
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                }
              )
            }}
          >
            <p className="text-base font-semibold sm:col-span-2">
              Tell us about your payment
            </p>
            <Field label="Paid on" htmlFor="pay-date">
              <Input
                id="pay-date"
                type="date"
                required
                max={today}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
            {usable.length ? (
              <Field label="Paid to" htmlFor="pay-account">
                <Select
                  items={{
                    [NONE]: "Not sure",
                    ...Object.fromEntries(usable.map((a) => [a.id, a.label])),
                  }}
                  value={account}
                  onValueChange={(v) => setAccount(v as string)}
                >
                  <SelectTrigger id="pay-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not sure</SelectItem>
                    {usable.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field label="Transaction ID" htmlFor="pay-ref">
              <Input
                id="pay-ref"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field
              label="Screenshot"
              htmlFor="pay-file"
              hint="PNG or JPEG, up to 2 MB."
            >
              <Input
                id="pay-file"
                type="file"
                accept="image/png,image/jpeg"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > MAX_BYTES) {
                    toast.error("The screenshot must be 2 MB or smaller")
                    e.target.value = ""
                    return setFile(null)
                  }
                  setFile(f)
                }}
              />
            </Field>
            <Field label="Note" htmlFor="pay-note" className="sm:col-span-2">
              <Textarea
                id="pay-note"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={!price || !file || submit.isPending}
              >
                Send for approval
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
