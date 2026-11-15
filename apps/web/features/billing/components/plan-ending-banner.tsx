"use client"

import { PLANS } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"
import { formatDate } from "@/lib/format"

import { useBillingOverview } from "../api/queries"

const DAY = 86_400_000

/**
 * Manually paid plans: a notice in the last 7 days of the period, and a
 * stronger one during the grace period after it ended. Billing readers only.
 */
export function PlanEndingBanner() {
  const { can } = usePermissions()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const billing = useBillingOverview()
  const b = billing.data
  if (!can("billing.read") || !b || !b.graceEndsAt || !b.currentPeriodEnd)
    return null
  if (b.planKey === "free" || b.effectivePlanKey === "free") return null
  const now = Date.now()
  const end = new Date(b.currentPeriodEnd).getTime()
  const ended = end <= now
  if (!ended && end - now > 7 * DAY) return null
  const plan = PLANS[b.planKey].name
  return (
    <div
      role="status"
      className={
        ended
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted px-4 py-2 text-sm"
      }
    >
      <span className="min-w-0 flex-1">
        {ended
          ? `Your ${plan} plan has ended. You move to Free limits on ${formatDate(b.graceEndsAt)}; nothing is deleted.`
          : `Your ${plan} plan ends on ${formatDate(b.currentPeriodEnd)}.`}
      </span>
      {can("billing.manage") ? (
        <Button
          size="sm"
          variant={ended ? "default" : "outline"}
          nativeButton={false}
          render={<Link href={`/${slug}/settings/billing`} />}
        >
          Renew
        </Button>
      ) : null}
    </div>
  )
}
