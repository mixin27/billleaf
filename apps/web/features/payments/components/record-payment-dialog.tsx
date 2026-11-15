"use client"

import {
  fromMinorUnits,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  toMinorUnits,
} from "@workspace/contracts"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useRecordPayment } from "../api/mutations"

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: {
    id: string
    number: string | null
    currency: string
    amountDue: number
  }
  locale?: string
}) {
  const record = useRecordPayment(invoice.id)
  const [amount, setAmount] = React.useState("")
  const [paidOn, setPaidOn] = React.useState("")
  const [method, setMethod] = React.useState<PaymentMethod>("bank_transfer")
  const [reference, setReference] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setAmount(fromMinorUnits(invoice.amountDue, invoice.currency))
    setPaidOn("")
    setMethod("bank_transfer")
    setReference("")
  }, [open, invoice.amountDue, invoice.currency])

  const minor = toMinorUnits(amount, invoice.currency)
  const amountError =
    minor === null || minor <= 0
      ? "Enter a positive amount"
      : minor > invoice.amountDue
        ? `More than the ${money(invoice.amountDue, invoice.currency, locale)} due`
        : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment for {invoice.number}</DialogTitle>
          <DialogDescription>
            Balance due {money(invoice.amountDue, invoice.currency, locale)}. A
            receipt is created automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          id="payment-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (amountError || minor === null) return
            record.mutate(
              { amount: minor, paidOn: paidOn || undefined, method, reference },
              {
                onSuccess: (p) => {
                  toast.success(`Payment recorded · receipt ${p.receiptNumber}`)
                  onOpenChange(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field
            label={`Amount (${invoice.currency})`}
            htmlFor="pay-amount"
            error={amount ? amountError : undefined}
          >
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Paid on" htmlFor="pay-date" hint="Blank = today">
            <Input
              id="pay-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </Field>
          <Field label="Method" htmlFor="pay-method">
            <Select
              items={PAYMENT_METHOD_LABELS}
              value={method}
              onValueChange={(v) => v && setMethod(v as PaymentMethod)}
            >
              <SelectTrigger id="pay-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Reference"
            htmlFor="pay-ref"
            hint="Transfer ID, cheque no., …"
          >
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="payment-form"
            disabled={Boolean(amountError) || record.isPending}
          >
            {record.isPending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
