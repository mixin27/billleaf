"use client"

import { formatDuration } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useInvoiceFromTime } from "../api/mutations"
import { useProjectTimeSummary } from "../api/queries"
import { BudgetBar, hoursLabel } from "./budget-bar"
import { TimeEntryDialog } from "./time-entry-dialog"

/**
 * Time totals for a project (money, cost and profit where known), progress
 * against its estimates, plus log time / invoice unbilled time.
 */
export function ProjectTime({
  projectId,
  billing,
  hasClient,
  locale,
  today,
  estimateMinutes = null,
  estimateAmount = null,
  fixedPrice = null,
}: {
  projectId: string
  billing: "hourly" | "fixed" | "non_billable"
  hasClient: boolean
  locale?: string
  today: string
  estimateMinutes?: number | null
  estimateAmount?: number | null
  /** Price of a fixed-price project, for its profit. */
  fixedPrice?: number | null
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { can } = usePermissions()
  const summary = useProjectTimeSummary(projectId)
  const invoice = useInvoiceFromTime()
  const [logging, setLogging] = React.useState(false)
  const s = summary.data
  const revenue =
    billing === "hourly"
      ? (s?.billableAmount ?? null)
      : billing === "fixed"
        ? fixedPrice
        : null
  const profit =
    s && s.cost !== null && revenue !== null ? revenue - s.cost : null
  const canInvoice =
    billing === "hourly" &&
    hasClient &&
    can("invoice.create") &&
    can("time.read")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Time</CardTitle>
        <div className="flex gap-2">
          {can("time.track") || can("time.manage") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogging(true)}
            >
              Log time
            </Button>
          ) : null}
          {canInvoice ? (
            <Button
              size="sm"
              disabled={!s || s.unbilledSeconds === 0 || invoice.isPending}
              onClick={() =>
                invoice.mutate(projectId, {
                  onSuccess: (inv) => {
                    toast.success("Draft invoice created from unbilled time")
                    router.push(`/${slug}/invoices/${inv.id}`)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Invoice unbilled time
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="font-medium tabular-nums">
              {formatDuration(s?.totalSeconds ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Billable</dt>
            <dd className="font-medium tabular-nums">
              {formatDuration(s?.billableSeconds ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Unbilled</dt>
            <dd className="font-medium tabular-nums">
              {formatDuration(s?.unbilledSeconds ?? 0)}
              {s?.unbilledAmount ? (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {money(s.unbilledAmount, s.currency, locale)}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
        {s && (s.billableAmount !== null || s.cost !== null) ? (
          <dl className="mt-4 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
            {s.billableAmount !== null ? (
              <div>
                <dt className="text-xs text-muted-foreground">
                  Billable amount
                </dt>
                <dd className="font-medium tabular-nums">
                  {money(s.billableAmount, s.currency, locale)}
                </dd>
              </div>
            ) : null}
            {s.cost !== null ? (
              <div>
                <dt className="text-xs text-muted-foreground">Cost</dt>
                <dd className="font-medium tabular-nums">
                  {money(s.cost, s.currency, locale)}
                </dd>
              </div>
            ) : null}
            {profit !== null ? (
              <div>
                <dt className="text-xs text-muted-foreground">
                  {billing === "fixed" ? "Profit (price − cost)" : "Profit"}
                </dt>
                <dd className="font-medium tabular-nums">
                  {money(profit, s.currency, locale)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {s &&
        (estimateMinutes || (estimateAmount && s.billableAmount !== null)) ? (
          <div className="mt-4 flex flex-col gap-3 border-t pt-4">
            {estimateMinutes ? (
              <BudgetBar
                label="Time estimate"
                used={s.totalSeconds / 60}
                estimate={estimateMinutes}
                usedText={hoursLabel(s.totalSeconds)}
                estimateText={hoursLabel(estimateMinutes * 60)}
              />
            ) : null}
            {estimateAmount && s.billableAmount !== null ? (
              <BudgetBar
                label="Budget"
                used={s.billableAmount}
                estimate={estimateAmount}
                usedText={money(s.billableAmount, s.currency, locale)}
                estimateText={money(estimateAmount, s.currency, locale)}
              />
            ) : null}
          </div>
        ) : null}
        {s && s.unapprovedSeconds > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {hoursLabel(s.unapprovedSeconds)} of unbilled time is waiting for
            timesheet approval and isn&apos;t invoiced yet.
          </p>
        ) : null}
        {s && s.unratedSeconds > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {hoursLabel(s.unratedSeconds)} of unbilled time has no hourly rate.
            Set one on the project, a task, or in Settings → Rates.
          </p>
        ) : null}
        {s && s.cost !== null && s.uncostedSeconds > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Cost leaves out {hoursLabel(s.uncostedSeconds)} by members without a
            cost rate in {s.currency}.
          </p>
        ) : null}
        {billing === "hourly" && !hasClient ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Add a client to the project to invoice its time.
          </p>
        ) : null}
      </CardContent>
      <TimeEntryDialog
        open={logging}
        onOpenChange={setLogging}
        defaultDate={today}
        defaultProjectId={projectId}
      />
    </Card>
  )
}
