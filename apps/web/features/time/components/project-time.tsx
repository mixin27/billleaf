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
import { TimeEntryDialog } from "./time-entry-dialog"

/** Time totals for a project, plus log time / invoice unbilled time. */
export function ProjectTime({
  projectId,
  billing,
  hasClient,
  locale,
  today,
}: {
  projectId: string
  billing: "hourly" | "fixed" | "non_billable"
  hasClient: boolean
  locale?: string
  today: string
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const { can } = usePermissions()
  const summary = useProjectTimeSummary(projectId)
  const invoice = useInvoiceFromTime()
  const [logging, setLogging] = React.useState(false)
  const s = summary.data
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
