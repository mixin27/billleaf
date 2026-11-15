"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { ColumnChart } from "@/features/dashboard"

import { useAdminOverview } from "../api/queries"

function Tile({
  label,
  value,
  hint,
  href,
}: {
  label: string
  value: string | number
  hint?: string
  href?: string
}) {
  const body = (
    <Card className="h-full transition-colors hover:bg-muted/40">
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

export function AdminOverview() {
  const o = useAdminOverview().data
  if (!o) return null
  const failed = o.failedJobs.reduce((s, j) => s + j.count, 0)
  const fmtWeek = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" description="How the platform is doing." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile
          label="To approve"
          value={o.pendingPayments}
          hint={o.pendingPayments ? "Subscription payments" : "All clear"}
          href="/admin/approvals"
        />
        <Tile
          label="Users"
          value={o.users.total}
          hint={`${o.users.verified} verified · +${o.users.last7Days} this week`}
          href="/admin/users"
        />
        <Tile
          label="Workspaces"
          value={o.workspaces.total}
          hint={`${o.workspaces.active30Days} active in 30 days`}
          href="/admin/workspaces"
        />
        <Tile
          label="Paying plans"
          value={o.plans
            .filter((p) => p.planKey !== "free")
            .reduce((s, p) => s + p.count, 0)}
          hint={o.plans.map((p) => `${p.planKey} ${p.count}`).join(" · ")}
          href="/admin/workspaces"
        />
        <Tile
          label="Failed jobs"
          value={failed}
          hint={
            failed
              ? o.failedJobs
                  .filter((j) => j.count)
                  .map((j) => `${j.queue} ${j.count}`)
                  .join(" · ")
              : "All clear"
          }
          href="/admin/jobs"
        />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-base font-semibold">Sign-ups per week</p>
          <ColumnChart
            caption="Sign-ups per week"
            data={o.signupsByWeek.map((w) => ({
              key: w.week,
              label: fmtWeek.format(new Date(`${w.week}T00:00:00Z`)),
              value: w.count,
              display: String(w.count),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}
