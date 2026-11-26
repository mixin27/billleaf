"use client"

import {
  fromMinorUnits,
  PAYMENT_METHOD_FOR_ACCOUNT,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentProof,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { DateInput } from "@/components/form/date-input"
import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  useConfirmProof,
  usePaymentProofs,
  useRejectProof,
} from "../api/proofs"

/**
 * Clients' "I've paid" submissions waiting for review: screenshot, amount,
 * reference. Confirm records the payment and emails the receipt; reject
 * tells the client why. Per invoice, or across invoices (payments page).
 */
export function PaymentProofsPanel({
  invoiceId,
  locale,
}: {
  invoiceId?: string
  locale?: string
}) {
  const { can } = usePermissions()
  const proofs = usePaymentProofs(
    { status: "pending", invoiceId, pageSize: 20, sort: "createdAt:asc" },
    can("payment.read")
  )
  const [confirming, setConfirming] = React.useState<PaymentProof | null>(null)
  const [rejecting, setRejecting] = React.useState<PaymentProof | null>(null)
  const [viewing, setViewing] = React.useState<PaymentProof | null>(null)
  const items = proofs.data?.items ?? []
  if (!can("payment.read") || items.length === 0) return null
  const canReview = can("payment.record")

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">
          Payments to confirm ({proofs.data?.total ?? items.length})
        </CardTitle>
        <CardDescription>
          Your client says they paid. Check the screenshot against your bank or
          wallet before confirming.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {items.map((p) => (
          <ProofRow
            key={p.id}
            proof={p}
            locale={locale}
            showInvoice={!invoiceId}
            canReview={canReview}
            onView={() => setViewing(p)}
            onConfirm={() => setConfirming(p)}
            onReject={() => setRejecting(p)}
          />
        ))}
      </CardContent>
      <ConfirmDialog
        proof={confirming}
        locale={locale}
        onClose={() => setConfirming(null)}
      />
      <RejectDialog proof={rejecting} onClose={() => setRejecting(null)} />
      <Dialog
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment screenshot</DialogTitle>
            <DialogDescription>
              {viewing
                ? `${money(viewing.amount, viewing.currency, locale)} from ${viewing.clientName}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {viewing?.fileUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
            <img
              src={viewing.fileUrl}
              alt="Payment screenshot"
              className="max-h-[70vh] w-full rounded-md border object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function ProofRow({
  proof: p,
  locale,
  showInvoice,
  canReview,
  onView,
  onConfirm,
  onReject,
}: {
  proof: PaymentProof
  locale?: string
  showInvoice: boolean
  canReview: boolean
  onView: () => void
  onConfirm: () => void
  onReject: () => void
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  return (
    <div className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={onView}
        className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="View screenshot"
      >
        {p.fileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
          <img
            src={p.fileUrl}
            alt=""
            className="size-16 rounded-md border object-cover"
          />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-md border text-xs text-muted-foreground">
            No image
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium tabular-nums">
          {money(p.amount, p.currency, locale)}
          <span className="font-normal text-muted-foreground">
            {" "}
            · paid {formatDate(p.paidOn, locale)}
          </span>
        </p>
        <p className="text-muted-foreground">
          {[
            showInvoice ? (
              <Link
                key="inv"
                className="underline"
                href={`/${slug}/invoices/${p.invoiceId}`}
              >
                {p.invoiceNumber ?? "Invoice"}
              </Link>
            ) : null,
            p.clientName,
            p.paymentAccountLabel,
            p.reference ? `Ref. ${p.reference}` : null,
          ]
            .filter(Boolean)
            .flatMap((x, i) => (i ? [" · ", x] : [x]))}
        </p>
        {p.note ? <p className="mt-1 whitespace-pre-line">“{p.note}”</p> : null}
        <p className="text-xs text-muted-foreground">
          Sent by {p.submittedEmail} on{" "}
          {formatDate(p.createdAt.slice(0, 10), locale)}
        </p>
      </div>
      {canReview ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onReject}>
            Reject
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ConfirmDialog({
  proof,
  locale,
  onClose,
}: {
  proof: PaymentProof | null
  locale?: string
  onClose: () => void
}) {
  const confirm = useConfirmProof()
  const [amount, setAmount] = React.useState("")
  const [paidOn, setPaidOn] = React.useState("")
  const [method, setMethod] = React.useState<PaymentMethod>("mobile_wallet")
  const [reference, setReference] = React.useState("")
  const [sendReceipt, setSendReceipt] = React.useState(true)

  React.useEffect(() => {
    if (!proof) return
    setAmount(fromMinorUnits(proof.amount, proof.currency))
    setPaidOn(proof.paidOn)
    setMethod(
      proof.paymentAccountKind
        ? PAYMENT_METHOD_FOR_ACCOUNT[proof.paymentAccountKind]
        : "bank_transfer"
    )
    setReference(proof.reference ?? "")
    setSendReceipt(true)
  }, [proof])

  return (
    <Dialog open={proof !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm payment</DialogTitle>
          <DialogDescription>
            Records the payment on the invoice and issues a receipt. Adjust
            anything that doesn't match what you received.
          </DialogDescription>
        </DialogHeader>
        {proof ? (
          <form
            id="confirm-proof"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              const minor = toMinorUnits(amount, proof.currency)
              if (minor === null || minor <= 0)
                return void toast.error("Enter a valid amount")
              confirm.mutate(
                {
                  id: proof.id,
                  amount: minor,
                  paidOn,
                  method,
                  reference,
                  sendReceipt,
                },
                {
                  onSuccess: () => {
                    toast.success(
                      sendReceipt
                        ? "Payment recorded and receipt sent"
                        : "Payment recorded"
                    )
                    onClose()
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                }
              )
            }}
          >
            <Field label={`Amount (${proof.currency})`} htmlFor="cp-amount">
              <Input
                id="cp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Paid on" htmlFor="cp-date">
              <DateInput
                id="cp-date"
                value={paidOn}
                onChange={(v) => setPaidOn(v)}
                required
              />
            </Field>
            <Field label="Method" htmlFor="cp-method">
              <Select
                items={PAYMENT_METHOD_LABELS}
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
              >
                <SelectTrigger id="cp-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Reference" htmlFor="cp-ref" hint="Optional">
              <Input
                id="cp-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="cp-receipt"
                checked={sendReceipt}
                onCheckedChange={(v) => setSendReceipt(Boolean(v))}
              />
              <Label htmlFor="cp-receipt" className="font-normal">
                Email the receipt to {proof.submittedEmail}
              </Label>
            </div>
          </form>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="confirm-proof"
            disabled={confirm.isPending}
          >
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  proof,
  onClose,
}: {
  proof: PaymentProof | null
  onClose: () => void
}) {
  const reject = useRejectProof()
  const [reason, setReason] = React.useState("")
  React.useEffect(() => setReason(""), [proof])
  return (
    <Dialog open={proof !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this payment?</DialogTitle>
          <DialogDescription>
            Your client gets an email with your note and can upload a new
            screenshot.
          </DialogDescription>
        </DialogHeader>
        <form
          id="reject-proof"
          onSubmit={(e) => {
            e.preventDefault()
            if (!proof) return
            reject.mutate(
              { id: proof.id, reason },
              {
                onSuccess: () => {
                  toast.success("Your client has been told")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field label="What's wrong?" htmlFor="rp-reason">
            <Textarea
              id="rp-reason"
              rows={3}
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. No transfer with this reference arrived"
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
            form="reject-proof"
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
