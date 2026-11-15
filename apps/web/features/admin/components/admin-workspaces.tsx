"use client"

import {
  type AdminWorkspaceSummary,
  PLANS,
  type PlanKey,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableSelectFilter,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { Field } from "@/components/form/field"
import { PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  useAdminWorkspace,
  useAdminWorkspaces,
  useSetWorkspacePlan,
} from "../api/queries"

const PLAN_KEYS = ["free", "pro", "team"] as const
const planLabel = (p: PlanKey) => PLANS[p].name
const date = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : "—")

function PlanBadge({ plan }: { plan: PlanKey }) {
  return (
    <Badge variant={plan === "free" ? "secondary" : "default"}>
      {planLabel(plan)}
    </Badge>
  )
}

const col = columnsFor<AdminWorkspaceSummary>()

export function AdminWorkspaces() {
  const table = useDataTableState({ sort: "createdAt:desc" })
  const [plan, setPlan] = useQueryState("plan", parseAsStringLiteral(PLAN_KEYS))
  const q = useAdminWorkspaces({ ...table.query, plan: plan ?? undefined })
  const columns = [
    col.accessor("name", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Workspace" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.owner?.email ?? row.original.slug}
          </p>
        </div>
      ),
    }),
    col.accessor("effectivePlanKey", {
      header: "Plan",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <PlanBadge plan={row.original.effectivePlanKey} />
          {row.original.currentPeriodEnd ? (
            <span className="text-xs text-muted-foreground">
              until {date(row.original.currentPeriodEnd)}
            </span>
          ) : null}
        </div>
      ),
    }),
    col.accessor("members", {
      header: "Members",
      meta: {
        label: "Members",
        hideBelow: "sm",
        align: "right",
        className: "tabular-nums",
      },
    }),
    col.accessor("createdAt", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      enableSorting: true,
      meta: {
        label: "Created",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => date(getValue()),
    }),
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workspaces"
        description="Every workspace on Billleaf."
      />
      <DataTable
        id="admin-workspaces"
        columns={columns}
        data={q.data?.items}
        total={q.data?.total}
        state={table}
        isLoading={q.isPending}
        error={q.error}
        filtered={Boolean(plan)}
        getRowHref={(w) => `/admin/workspaces/${w.id}`}
        empty={() => <DataTableEmpty title="No workspaces found" />}
        toolbar={(t) => (
          <DataTableToolbar
            table={t}
            state={table}
            searchPlaceholder="Search name, slug or owner email…"
            filtered={Boolean(plan)}
            onReset={() => void setPlan(null)}
            filters={
              <DataTableSelectFilter
                title="Plan"
                value={plan}
                options={PLAN_KEYS.map((p) => ({
                  value: p,
                  label: planLabel(p),
                }))}
                onChange={(v) => {
                  void setPlan(v)
                  table.resetPage()
                }}
              />
            }
          />
        )}
      />
    </div>
  )
}

export function AdminWorkspaceDetail({ id }: { id: string }) {
  const q = useAdminWorkspace(id)
  const [setting, setSetting] = React.useState(false)
  if (q.isPending) return <Skeleton className="h-64 w-full" />
  if (q.error)
    return <p className="text-sm text-destructive">{q.error.message}</p>
  const w = q.data
  const s = w.subscription
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={w.name}
        badge={<PlanBadge plan={w.effectivePlanKey} />}
        description={`/${w.slug} · created ${date(w.createdAt)}`}
        actions={<Button onClick={() => setSetting(true)}>Set plan</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Fact
                label="Effective plan"
                value={planLabel(s.effectivePlanKey)}
              />
              <Fact
                label="Stored plan"
                value={`${planLabel(s.planKey)} · ${s.status}`}
              />
              <Fact label="Interval" value={s.interval ?? "—"} />
              <Fact
                label={s.cancelAtPeriodEnd ? "Ends" : "Renews"}
                value={date(s.currentPeriodEnd)}
              />
              <Fact label="Provider" value={s.provider ?? "—"} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile and usage</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Business email" value={w.profile.email ?? "—"} />
              <Fact label="Country" value={w.profile.country ?? "—"} />
              <Fact
                label="Currency · time zone"
                value={`${w.profile.defaultCurrency} · ${w.profile.timezone}`}
              />
              <Fact
                label="Active clients"
                value={String(w.usage.activeClients)}
              />
              <Fact
                label="Invoices this month"
                value={String(w.usage.invoicesThisMonth)}
              />
              <Fact label="Storage" value={`${w.usage.storageMb} MB`} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({w.members})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {w.memberList.map((m) => (
            <Link
              key={m.userId}
              href={`/admin/users/${m.userId}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-muted/40"
            >
              <span className="font-medium">{m.name}</span>
              <span className="text-muted-foreground">{m.email}</span>
              <Badge variant="outline" className="ml-auto">
                {m.role}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan payments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {w.subscriptionPayments.length === 0 ? (
            <p className="text-muted-foreground">None yet.</p>
          ) : (
            w.subscriptionPayments.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="font-medium">
                  {planLabel(p.planKey)} · {p.periods} {p.interval}
                  {p.periods === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums">
                  {money(p.amount, p.currency)}
                </span>
                <Badge
                  variant={
                    p.status === "approved"
                      ? "default"
                      : p.status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {p.status === "pending" ? "To review" : p.status}
                </Badge>
                <span className="text-muted-foreground">
                  paid {date(p.paidOn)}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                  {p.periodEnd ? ` · until ${date(p.periodEnd)}` : ""}
                </span>
                {p.status === "pending" ? (
                  <Link href="/admin/approvals" className="ml-auto underline">
                    Review
                  </Link>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Billing events</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {w.billingEvents.length === 0 ? (
            <p className="text-muted-foreground">None yet.</p>
          ) : (
            w.billingEvents.map((e) => (
              <div key={e.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{e.type}</span>
                <span className="text-muted-foreground">{e.provider}</span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString()}
                </span>
                {e.error ? (
                  <span className="w-full text-destructive">{e.error}</span>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="self-start"
        nativeButton={false}
        render={<Link href={`/admin/audit?workspace=${w.id}`} />}
      >
        Audit log for this workspace
      </Button>

      <SetPlanDialog
        id={w.id}
        current={s.effectivePlanKey}
        open={setting}
        onOpenChange={setSetting}
      />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function SetPlanDialog({
  id,
  current,
  open,
  onOpenChange,
}: {
  id: string
  current: PlanKey
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const save = useSetWorkspacePlan(id)
  const [plan, setPlan] = React.useState<PlanKey>(current)
  const [interval, setInterval] = React.useState<"month" | "year">("month")
  const [periodEnd, setPeriodEnd] = React.useState("")
  const [reason, setReason] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    setPlan(current === "free" ? "pro" : current)
    setInterval("month")
    setPeriodEnd("")
    setReason("")
  }, [open, current])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set plan</DialogTitle>
          <DialogDescription>
            For comps, corrections or payments taken outside the app. Takes
            effect immediately and is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <form
          id="set-plan"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(
              {
                planKey: plan,
                interval,
                periodEnd: plan === "free" || !periodEnd ? null : periodEnd,
                reason,
              },
              {
                onSuccess: () => {
                  toast.success("Plan updated")
                  onOpenChange(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field label="Plan" htmlFor="sp-plan">
            <Select
              items={Object.fromEntries(
                PLAN_KEYS.map((p) => [p, planLabel(p)])
              )}
              value={plan}
              onValueChange={(v) => setPlan(v as PlanKey)}
            >
              <SelectTrigger id="sp-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_KEYS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {planLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing interval" htmlFor="sp-interval">
            <Select
              items={{ month: "Monthly", year: "Yearly" }}
              value={interval}
              onValueChange={(v) => setInterval(v as "month" | "year")}
            >
              <SelectTrigger id="sp-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {plan !== "free" ? (
            <Field
              label="Ends on"
              htmlFor="sp-end"
              hint="Empty = no end date. After it, the workspace returns to Free."
              className="sm:col-span-2"
            >
              <Input
                id="sp-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Reason" htmlFor="sp-reason" className="sm:col-span-2">
            <Textarea
              id="sp-reason"
              rows={2}
              required
              minLength={3}
              placeholder="e.g. Paid 30,000 MMK by KBZPay, ref 7781"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="set-plan"
            disabled={save.isPending || reason.trim().length < 3}
          >
            Set plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
