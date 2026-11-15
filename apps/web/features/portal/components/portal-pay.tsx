"use client"

import {
  fromMinorUnits,
  type PortalInvoice,
  type PortalPaymentAccount,
  toMinorUnits,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useSubmitPaymentProof } from "../api/queries"

const MAX_BYTES = 2 * 1024 * 1024
const NONE = "__none__"

/** Ways to pay this invoice: account details (copyable) and QR codes. */
export function HowToPay({ accounts }: { accounts: PortalPaymentAccount[] }) {
  const [qr, setQr] = React.useState<PortalPaymentAccount | null>(null)
  if (accounts.length === 0) return null
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-base font-semibold">How to pay</p>
          <p className="text-sm text-muted-foreground">
            Pay with any of these, then tell us below so it's confirmed quickly.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex gap-3 rounded-lg border p-3 text-sm"
            >
              {a.qrUrl ? (
                <button
                  type="button"
                  onClick={() => setQr(a)}
                  className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Show ${a.label} QR code`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL */}
                  <img
                    src={a.qrUrl}
                    alt=""
                    className="size-20 rounded-md border bg-white object-contain p-1"
                  />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.label}</p>
                {a.accountName ? (
                  <p className="text-muted-foreground">{a.accountName}</p>
                ) : null}
                {a.accountNumber ? (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {a.accountNumber}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(a.accountNumber!.replace(/\s/g, ""))
                          .then(() => toast.success("Copied"))
                      }
                    >
                      Copy
                    </Button>
                  </div>
                ) : null}
                {a.instructions ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">
                    {a.instructions}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <Dialog open={qr !== null} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{qr?.label}</DialogTitle>
          </DialogHeader>
          {qr?.qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
            <img
              src={qr.qrUrl}
              alt={`${qr.label} QR code`}
              className="w-full rounded-md bg-white object-contain p-2"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

const STATUS: Record<
  PortalInvoice["paymentProofs"][number]["status"],
  { label: string; variant: "secondary" | "default" | "destructive" }
> = {
  pending: { label: "Waiting for review", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  rejected: { label: "Not confirmed", variant: "destructive" },
}

/** "I've paid" form plus the client's earlier submissions. */
export function PaymentProofForm({
  slug,
  invoice,
}: {
  slug: string
  invoice: PortalInvoice
}) {
  const submit = useSubmitPaymentProof(slug, invoice.id)
  const today = new Date().toISOString().slice(0, 10)
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState("")
  const [paidOn, setPaidOn] = React.useState(today)
  const [account, setAccount] = React.useState(NONE)
  const [reference, setReference] = React.useState("")
  const [note, setNote] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const pending = invoice.paymentProofs.filter((p) => p.status === "pending")
  // Everything due is already waiting for review: nothing more to report.
  const covered =
    pending.reduce((sum, p) => sum + p.amount, 0) >= invoice.amountDue

  React.useEffect(() => {
    if (!open) return
    setAmount(fromMinorUnits(invoice.amountDue, invoice.currency))
    setPaidOn(today)
    setAccount(invoice.paymentAccounts[0]?.id ?? NONE)
    setReference("")
    setNote("")
    setFile(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-4">
        {invoice.paymentProofs.length ? (
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold">Your payments</p>
            <ul className="flex flex-col gap-2 text-sm">
              {invoice.paymentProofs.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {money(p.amount, p.currency)}
                  </span>
                  <span className="text-muted-foreground">
                    paid {formatDate(p.paidOn)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <Badge variant={STATUS[p.status].variant}>
                    {STATUS[p.status].label}
                  </Badge>
                  {p.status === "rejected" && p.rejectionReason ? (
                    <span className="w-full text-muted-foreground">
                      “{p.rejectionReason}”
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!open ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {pending.length
                ? "We'll email you a receipt once it's confirmed."
                : "Already paid? Upload your payment screenshot."}
            </p>
            {covered ? null : (
              <Button onClick={() => setOpen(true)}>I've paid</Button>
            )}
          </div>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              const minor = toMinorUnits(amount, invoice.currency)
              if (minor === null || minor <= 0)
                return void toast.error("Enter the amount you paid")
              if (!file) return void toast.error("Attach a screenshot")
              submit.mutate(
                {
                  file,
                  amount: minor,
                  paidOn,
                  paymentAccountId: account === NONE ? undefined : account,
                  reference,
                  note,
                },
                {
                  onSuccess: () => {
                    toast.success("Thanks! We'll confirm it soon.")
                    setOpen(false)
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                }
              )
            }}
          >
            <p className="text-base font-semibold sm:col-span-2">
              Tell us about your payment
            </p>
            <Field
              label={`Amount paid (${invoice.currency})`}
              htmlFor="pp-amount"
            >
              <Input
                id="pp-amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date paid" htmlFor="pp-date">
              <Input
                id="pp-date"
                type="date"
                required
                max={today}
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </Field>
            {invoice.paymentAccounts.length ? (
              <Field label="Paid with" htmlFor="pp-account">
                <Select
                  items={{
                    [NONE]: "Something else",
                    ...Object.fromEntries(
                      invoice.paymentAccounts.map((a) => [a.id, a.label])
                    ),
                  }}
                  value={account}
                  onValueChange={(v) => setAccount(String(v))}
                >
                  <SelectTrigger id="pp-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {invoice.paymentAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={NONE}>Something else</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field
              label="Transaction ID"
              htmlFor="pp-ref"
              hint="Optional, from your banking or wallet app"
            >
              <Input
                id="pp-ref"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field
              label="Screenshot"
              htmlFor="pp-file"
              hint="PNG or JPEG, up to 2 MB"
              className="sm:col-span-2"
            >
              <input
                id="pp-file"
                ref={input}
                type="file"
                accept="image/png,image/jpeg"
                className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > MAX_BYTES) {
                    toast.error("Screenshots must be 2 MB or smaller")
                    e.target.value = ""
                    return
                  }
                  setFile(f)
                }}
              />
            </Field>
            <Field
              label="Note"
              htmlFor="pp-note"
              hint="Optional"
              className="sm:col-span-2"
            >
              <Textarea
                id="pp-note"
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submit.isPending}>
                Send for confirmation
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
