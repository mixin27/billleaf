"use client"

import {
  type BillingInterval,
  COMMON_CURRENCIES,
  fromMinorUnits,
  type PaidPlanKey,
  PLANS,
  type PlatformPrice,
  toMinorUnits,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { PageHeader } from "@/components/page-header"
import { PaymentAccountsSettings } from "@/features/payment-accounts"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useAdminPrices, useDeletePrice, useSavePrice } from "../api/queries"

const PLAN_KEYS: PaidPlanKey[] = ["pro", "team"]
const INTERVALS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
}

/** Admin → Pricing: what each plan costs, and where workspaces pay. */
export function AdminPricing() {
  const prices = useAdminPrices()
  const save = useSavePrice()
  const remove = useDeletePrice()
  const [editing, setEditing] = React.useState<PlatformPrice | "new" | null>(
    null
  )
  const onError = (e: unknown) => toast.error(errorMessage(e))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Pricing"
        description="Plan prices and Billleaf's payment methods for manual subscriptions."
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold">Prices</h2>
            <p className="text-sm text-muted-foreground">
              Shown on Settings → Billing. A request keeps the price it was made
              at; changes apply to new payments.
            </p>
          </div>
          <Button onClick={() => setEditing("new")}>Add price</Button>
        </div>
        {prices.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : prices.error ? (
          <p className="text-sm text-destructive">{prices.error.message}</p>
        ) : prices.data.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No prices yet. Workspaces can&apos;t pay for a plan until you add
            one.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {prices.data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
              >
                <span className="font-medium">
                  {PLANS[p.planKey].name} · {INTERVALS[p.interval]}
                </span>
                <span className="tabular-nums">
                  {money(p.amount, p.currency)}
                </span>
                {!p.active ? <Badge variant="secondary">Hidden</Badge> : null}
                <span className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(p)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({ id: p.id, active: !p.active }, { onError })
                    }
                  >
                    {p.active ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(p.id, {
                        onSuccess: () => toast.success("Price deleted"),
                        onError,
                      })
                    }
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PaymentAccountsSettings source="platform" />

      <PriceDialog
        price={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function PriceDialog({
  price,
  open,
  onClose,
}: {
  price: PlatformPrice | null
  open: boolean
  onClose: () => void
}) {
  const save = useSavePrice()
  const [planKey, setPlanKey] = React.useState<PaidPlanKey>("pro")
  const [interval, setInterval] = React.useState<BillingInterval>("month")
  const [currency, setCurrency] = React.useState("MMK")
  const [amount, setAmount] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    setPlanKey(price?.planKey ?? "pro")
    setInterval(price?.interval ?? "month")
    setCurrency(price?.currency ?? "MMK")
    setAmount(price ? fromMinorUnits(price.amount, price.currency) : "")
  }, [open, price])
  const currencies = [...new Set(["MMK", ...COMMON_CURRENCIES])]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{price ? "Edit price" : "Add price"}</DialogTitle>
          <DialogDescription>
            One price per plan, billing period and currency.
          </DialogDescription>
        </DialogHeader>
        <form
          id="price-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            const minor = toMinorUnits(amount, currency)
            if (minor === null || minor <= 0)
              return void toast.error("Enter a price")
            save.mutate(
              price
                ? { id: price.id, amount: minor }
                : { planKey, interval, currency, amount: minor },
              {
                onSuccess: () => {
                  toast.success("Price saved")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field label="Plan" htmlFor="pr-plan">
            <Select
              items={{ pro: PLANS.pro.name, team: PLANS.team.name }}
              value={planKey}
              disabled={Boolean(price)}
              onValueChange={(v) => setPlanKey(v as PaidPlanKey)}
            >
              <SelectTrigger id="pr-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PLANS[k].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing period" htmlFor="pr-interval">
            <Select
              items={INTERVALS}
              value={interval}
              disabled={Boolean(price)}
              onValueChange={(v) => setInterval(v as BillingInterval)}
            >
              <SelectTrigger id="pr-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency" htmlFor="pr-currency">
            <Select
              items={Object.fromEntries(currencies.map((c) => [c, c]))}
              value={currency}
              disabled={Boolean(price)}
              onValueChange={(v) => setCurrency(v as string)}
            >
              <SelectTrigger id="pr-currency" className="w-full">
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
          <Field label="Price" htmlFor="pr-amount">
            <Input
              id="pr-amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="price-form" disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
