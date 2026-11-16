"use client"

import {
  fromMinorUnits,
  type MemberRate,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useSetDefaultRate, useSetMemberRate } from "../api/mutations"
import { useRates } from "../api/queries"

/** Parse an optional money input: "" → null, invalid → undefined. */
function parseRate(v: string, currency: string): number | null | undefined {
  if (!v.trim()) return null
  const minor = toMinorUnits(v, currency)
  return minor === null || minor < 0 ? undefined : minor
}

/**
 * Settings → Rates: the workspace default billable rate and each member's
 * billable and cost rates. The most specific rate wins: task → project →
 * member → default.
 */
export function RatesSettings() {
  const { can } = usePermissions()
  const rates = useRates()
  const profile = useWorkspaceProfile()
  const locale = profile.data?.locale
  const canManage = can("rate.manage")
  const [editing, setEditing] = React.useState<MemberRate | null>(null)

  if (rates.isPending) return <Skeleton className="h-64 w-full" />
  if (rates.error)
    return <p className="text-sm text-destructive">{rates.error.message}</p>
  const data = rates.data
  const show = (v: number | null, currency: string | null) =>
    v === null || !currency ? "—" : `${money(v, currency, locale)} / h`

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl text-sm text-muted-foreground">
        <p>
          Hourly projects price time with the most specific rate set: the
          task&apos;s, then the project&apos;s, then the member&apos;s, then the
          default below. Member and default rates are in {data.currency} and
          apply only to projects in {data.currency}.
        </p>
        <p className="mt-2">
          Invoiced time keeps the rate it was invoiced at. Cost rates (what an
          hour of someone&apos;s time costs you) show cost and profit on
          projects and reports.
        </p>
      </div>

      <DefaultRateCard
        currency={data.currency}
        rate={data.defaultHourlyRate}
        canManage={canManage}
        locale={locale}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Members</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Billable rate</TableHead>
                <TableHead className="text-right">Cost rate</TableHead>
                {canManage ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {show(m.hourlyRate, m.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {show(m.costRate, m.currency)}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(m)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.members.some(
          (m) => m.currency && m.currency !== data.currency
        ) ? (
          <p className="text-xs text-muted-foreground">
            Some rates were saved in another currency before the default
            currency changed. Edit them to save them in {data.currency}.
          </p>
        ) : null}
      </section>

      <MemberRateDialog
        member={editing}
        currency={data.currency}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function DefaultRateCard({
  currency,
  rate,
  canManage,
  locale,
}: {
  currency: string
  rate: number | null
  canManage: boolean
  locale?: string
}) {
  const save = useSetDefaultRate()
  const [value, setValue] = React.useState("")
  React.useEffect(() => {
    setValue(rate === null ? "" : fromMinorUnits(rate, currency))
  }, [rate, currency])
  const parsed = parseRate(value, currency)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-semibold">Default hourly rate</p>
        {canManage ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (parsed === undefined) return
              save.mutate(parsed, {
                onSuccess: () => toast.success("Default rate saved"),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }}
          >
            <Field
              label={`Per hour (${currency})`}
              htmlFor="default-rate"
              error={parsed === undefined ? "Enter a valid amount" : undefined}
            >
              <Input
                id="default-rate"
                inputMode="decimal"
                placeholder="No default"
                className="w-40"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              disabled={save.isPending || parsed === undefined}
            >
              Save
            </Button>
          </form>
        ) : (
          <p className="text-sm tabular-nums">
            {rate === null ? "None" : `${money(rate, currency, locale)} / h`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MemberRateDialog({
  member,
  currency,
  onClose,
}: {
  member: MemberRate | null
  currency: string
  onClose: () => void
}) {
  const save = useSetMemberRate()
  const [hourly, setHourly] = React.useState("")
  const [cost, setCost] = React.useState("")
  React.useEffect(() => {
    if (!member) return
    // Show stored values only when they're in today's currency.
    const same = member.currency === currency
    setHourly(
      same && member.hourlyRate !== null
        ? fromMinorUnits(member.hourlyRate, currency)
        : ""
    )
    setCost(
      same && member.costRate !== null
        ? fromMinorUnits(member.costRate, currency)
        : ""
    )
  }, [member, currency])
  const h = parseRate(hourly, currency)
  const c = parseRate(cost, currency)

  return (
    <Dialog open={member !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rates for {member?.name}</DialogTitle>
          <DialogDescription>
            Per hour, in {currency}. Leave empty for none.
          </DialogDescription>
        </DialogHeader>
        <form
          id="member-rate"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!member || h === undefined || c === undefined) return
            save.mutate(
              { memberId: member.memberId, hourlyRate: h, costRate: c },
              {
                onSuccess: () => {
                  toast.success("Rates saved")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field
            label="Billable rate"
            htmlFor="mr-hourly"
            hint="What clients pay for their time."
            error={h === undefined ? "Enter a valid amount" : undefined}
          >
            <Input
              id="mr-hourly"
              inputMode="decimal"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </Field>
          <Field
            label="Cost rate"
            htmlFor="mr-cost"
            hint="What their time costs you."
            error={c === undefined ? "Enter a valid amount" : undefined}
          >
            <Input
              id="mr-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="member-rate"
            disabled={save.isPending || h === undefined || c === undefined}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
