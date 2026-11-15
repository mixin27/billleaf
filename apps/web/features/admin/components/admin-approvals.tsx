"use client"

import {
  type AdminSubscriptionPayment,
  PLANS,
  subscriptionPaymentStatusSchema,
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
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  useAdminSubscriptionPayments,
  useApprovePayment,
  useRejectPayment,
} from "../api/queries"

const STATUSES = subscriptionPaymentStatusSchema.options
const LABELS = {
  pending: "To review",
  approved: "Approved",
  rejected: "Rejected",
}

const periods = (p: Pick<AdminSubscriptionPayment, "periods" | "interval">) =>
  `${p.periods} ${p.interval}${p.periods === 1 ? "" : "s"}`

/** Admin → Approvals: subscription payments waiting for a decision. */
export function AdminApprovals() {
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES).withDefault("pending")
  )
  const q = useAdminSubscriptionPayments({ status, pageSize: 50 })
  const [approving, setApproving] =
    React.useState<AdminSubscriptionPayment | null>(null)
  const [rejecting, setRejecting] =
    React.useState<AdminSubscriptionPayment | null>(null)
  const [image, setImage] = React.useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approvals"
        description="Check each screenshot against your bank or wallet, then approve to start or extend the plan."
      />
      <Tabs value={status} onValueChange={(v) => void setStatus(v as never)}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {q.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{q.error.message}</p>
      ) : q.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {status === "pending" ? "Nothing to review." : "None yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {q.data.items.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row"
            >
              {p.fileUrl ? (
                <button
                  type="button"
                  onClick={() => setImage(p.fileUrl)}
                  className="shrink-0 self-start rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label="Open the payment screenshot"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
                  <img
                    src={p.fileUrl}
                    alt=""
                    className="h-32 w-24 rounded-md border bg-muted object-cover"
                  />
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/workspaces/${p.workspace.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {p.workspace.name}
                  </Link>
                  <Badge variant="outline">
                    {PLANS[p.planKey].name} · {periods(p)}
                  </Badge>
                  <span className="font-semibold tabular-nums">
                    {money(p.amount, p.currency)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Paid {formatDate(p.paidOn)}
                  {p.paymentAccountLabel ? ` to ${p.paymentAccountLabel}` : ""}
                  {p.reference ? ` · ref ${p.reference}` : ""}
                </p>
                {p.note ? (
                  <p className="whitespace-pre-line">“{p.note}”</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Sent {new Date(p.createdAt).toLocaleString()}
                  {p.submittedBy ? ` by ${p.submittedBy.email}` : ""} · now on{" "}
                  {PLANS[p.currentPlanKey].name}
                  {p.currentPeriodEnd
                    ? ` until ${formatDate(p.currentPeriodEnd)}`
                    : ""}
                </p>
                {p.status === "approved" && p.periodEnd ? (
                  <p className="text-xs">
                    Granted {formatDate(p.periodStart)} →{" "}
                    {formatDate(p.periodEnd)}
                  </p>
                ) : null}
                {p.status === "rejected" && p.rejectionReason ? (
                  <p className="text-xs text-destructive">
                    “{p.rejectionReason}”
                  </p>
                ) : null}
              </div>
              {p.status === "pending" ? (
                <div className="flex gap-2 self-start">
                  <Button size="sm" onClick={() => setApproving(p)}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejecting(p)}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <ApproveDialog payment={approving} onClose={() => setApproving(null)} />
      <RejectDialog payment={rejecting} onClose={() => setRejecting(null)} />
      <Dialog open={image !== null} onOpenChange={(o) => !o && setImage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
          </DialogHeader>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
            <img
              src={image}
              alt="Payment screenshot"
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ApproveDialog({
  payment: p,
  onClose,
}: {
  payment: AdminSubscriptionPayment | null
  onClose: () => void
}) {
  const approve = useApprovePayment()
  const [count, setCount] = React.useState("1")
  React.useEffect(() => {
    if (p) setCount(String(p.periods))
  }, [p])
  const n = Number(count)
  return (
    <Dialog open={p !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve payment</DialogTitle>
          <DialogDescription>
            {p
              ? `${p.workspace.name} gets ${PLANS[p.planKey].name}. Renewing the same plan early adds to the current period; otherwise it starts today. The owners are emailed.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <form
          id="approve-payment"
          onSubmit={(e) => {
            e.preventDefault()
            if (!p) return
            approve.mutate(
              { id: p.id, periods: n !== p.periods ? n : undefined },
              {
                onSuccess: () => {
                  toast.success("Approved")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field
            label={`Periods to grant (${p?.interval ?? "month"}s)`}
            htmlFor="ap-periods"
            hint="Change only if the amount paid covers a different length."
          >
            <Input
              id="ap-periods"
              type="number"
              min={1}
              max={36}
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-32"
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="approve-payment"
            disabled={approve.isPending || !(n >= 1 && n <= 36)}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  payment: p,
  onClose,
}: {
  payment: AdminSubscriptionPayment | null
  onClose: () => void
}) {
  const reject = useRejectPayment()
  const [reason, setReason] = React.useState("")
  React.useEffect(() => {
    if (p) setReason("")
  }, [p])
  return (
    <Dialog open={p !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject payment</DialogTitle>
          <DialogDescription>
            The owners get your note by email and can upload a new screenshot.
          </DialogDescription>
        </DialogHeader>
        <form
          id="reject-payment"
          onSubmit={(e) => {
            e.preventDefault()
            if (!p) return
            reject.mutate(
              { id: p.id, reason },
              {
                onSuccess: () => {
                  toast.success("Rejected")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field label="Note to the workspace" htmlFor="rj-reason">
            <Textarea
              id="rj-reason"
              rows={3}
              required
              minLength={3}
              placeholder="e.g. We couldn't find a payment with this transaction ID"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="reject-payment"
            variant="destructive"
            disabled={reject.isPending || reason.trim().length < 3}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
