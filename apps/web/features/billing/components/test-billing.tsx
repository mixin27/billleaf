"use client"

import { PLANS, type TestPortalAction } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useTestCheckout, useTestPortalAction } from "../api/mutations"
import { useBillingOverview, useTestBillingSession } from "../api/queries"

const PORTAL_ACTIONS: {
  action: TestPortalAction
  label: string
  description: string
}[] = [
  {
    action: "cancel",
    label: "Cancel at period end",
    description: "Keeps the plan until the renewal date.",
  },
  {
    action: "resume",
    label: "Resume subscription",
    description: "Undo a scheduled cancellation.",
  },
  {
    action: "payment_failed",
    label: "Simulate failed payment",
    description: "Marks the subscription past due (grace period).",
  },
  {
    action: "payment_recovered",
    label: "Simulate successful payment",
    description: "Back to active and renews for another period.",
  },
  {
    action: "end_now",
    label: "End subscription now",
    description: "Cancels immediately; the workspace returns to Free.",
  },
]

/**
 * Stand-in for a provider's hosted checkout and billing portal. Every action
 * is delivered to the API as a signed webhook, like a real provider.
 */
export function TestBilling() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const token = useSearchParams().get("session") ?? ""
  const session = useTestBillingSession(token)
  const billing = useBillingOverview()
  const checkout = useTestCheckout()
  const portal = useTestPortalAction()
  const back = `/${slug}/settings/billing`

  if (!token)
    return <p className="text-sm text-destructive">Missing test session.</p>
  if (session.isPending || billing.isPending)
    return <Skeleton className="h-64 w-full" />
  if (session.error)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{session.error.message}</p>
        <Link href={back} className="text-sm underline">
          Back to billing
        </Link>
      </div>
    )
  const s = session.data
  const plan = PLANS[s.planKey]
  const fail = (e: unknown) => toast.error(errorMessage(e))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 rounded-lg border p-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Test {s.kind === "checkout" ? "checkout" : "billing portal"} · no real
          payment
        </p>
        <h2 className="mt-1 text-xl font-semibold">{s.workspaceName}</h2>
      </div>

      {s.kind === "checkout" ? (
        <>
          <div className="flex items-baseline justify-between rounded-md bg-muted p-4">
            <span>
              Billleaf {plan.name} ·{" "}
              {s.interval === "year" ? "yearly" : "monthly"}
            </span>
            <span className="font-semibold tabular-nums">
              {plan.prices
                ? money(plan.prices[s.interval ?? "month"], "USD", "en-US")
                : "$0"}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              className="sm:flex-1"
              disabled={checkout.isPending}
              onClick={() =>
                checkout.mutate(token, {
                  onSuccess: () => {
                    toast.success(`You're on ${plan.name}`)
                    router.push(back)
                  },
                  onError: fail,
                })
              }
            >
              {checkout.isPending ? "Processing…" : "Pay (test)"}
            </Button>
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={() => router.push(back)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {PLANS[billing.data!.planKey].name} ·{" "}
            {billing.data!.status.replace("_", " ")}
            {billing.data!.currentPeriodEnd
              ? ` · period ends ${formatDate(billing.data!.currentPeriodEnd)}`
              : ""}
            {billing.data!.cancelAtPeriodEnd ? " · cancels at period end" : ""}
          </p>
          <ul className="flex flex-col divide-y rounded-md border">
            {PORTAL_ACTIONS.map((a) => (
              <li
                key={a.action}
                className="flex items-center justify-between gap-4 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={a.action === "end_now" ? "destructive" : "outline"}
                  disabled={portal.isPending}
                  onClick={() =>
                    portal.mutate(
                      { session: token, action: a.action },
                      {
                        onSuccess: () => toast.success("Done"),
                        onError: fail,
                      }
                    )
                  }
                >
                  Run
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={() => router.push(back)}>
            Back to Billleaf
          </Button>
        </>
      )}
    </div>
  )
}
