"use client"

import {
  documentTotals,
  type Invoice,
  splitCredit,
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
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useCreateCreditNote } from "../api/queries"

/**
 * Issue a credit note for an issued invoice: the full amount left to credit,
 * or one line with an amount and tax rate. Shows how it will apply.
 */
export function CreditNoteDialog({
  invoice,
  open,
  onOpenChange,
  locale,
}: {
  invoice: Invoice
  open: boolean
  onOpenChange: (open: boolean) => void
  locale?: string
}) {
  const create = useCreateCreditNote(invoice.id)
  const credited = invoice.creditNotes
    .filter((c) => c.status === "issued")
    .reduce((s, c) => s + c.total, 0)
  const left = Math.max(0, invoice.total - credited)
  const canFull = credited === 0
  const [mode, setMode] = React.useState<"full" | "part">("part")
  const [reason, setReason] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [tax, setTax] = React.useState("0")
  React.useEffect(() => {
    if (!open) return
    setMode(credited === 0 ? "full" : "part")
    setReason("")
    setDescription("")
    setAmount("")
    // Same tax rate as the invoice's first line, as a sensible default.
    setTax(String((invoice.lines[0]?.taxRateBps ?? 0) / 100))
  }, [open, credited, invoice.lines])

  const unit = amount ? toMinorUnits(amount, invoice.currency) : null
  const taxBps = Math.round(Number(tax.replace(",", ".")) * 100)
  const taxInvalid = !Number.isFinite(taxBps) || taxBps < 0 || taxBps > 10_000
  const line =
    unit !== null && unit > 0 && !taxInvalid
      ? { quantity: 1, unitPrice: unit, taxRateBps: taxBps }
      : null
  const credit =
    mode === "full" ? invoice.total : line ? documentTotals([line]).total : 0
  const tooMuch = credit > left
  const split = splitCredit({
    credit,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    amountCredited: invoice.amountCredited,
  })
  const valid =
    reason.trim().length >= 3 &&
    credit > 0 &&
    !tooMuch &&
    (mode === "full" || (description.trim() && line))
  const fmt = (v: number) => money(v, invoice.currency, locale)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credit note for {invoice.number}</DialogTitle>
          <DialogDescription>
            Corrects the invoice without changing it. It&apos;s numbered and
            issued right away; void it to undo.
          </DialogDescription>
        </DialogHeader>
        <form
          id="credit-note-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            create.mutate(
              mode === "full"
                ? { reason, full: true }
                : {
                    reason,
                    lines: [
                      {
                        description,
                        quantity: 1,
                        unitPrice: unit!,
                        taxRateBps: taxBps,
                      },
                    ],
                  },
              {
                onSuccess: (n) => {
                  toast.success(`Credit note ${n.number} issued`)
                  onOpenChange(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Credit</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cn-mode"
                className="mt-1"
                checked={mode === "full"}
                disabled={!canFull}
                onChange={() => setMode("full")}
              />
              <span>
                The whole invoice ({fmt(invoice.total)})
                {canFull ? null : (
                  <span className="block text-xs text-muted-foreground">
                    Not available: part of it is already credited.
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="cn-mode"
                className="mt-1"
                checked={mode === "part"}
                onChange={() => setMode("part")}
              />
              <span>
                Part of it
                <span className="block text-xs text-muted-foreground">
                  Up to {fmt(left)} left to credit.
                </span>
              </span>
            </label>
          </fieldset>

          {mode === "part" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem_6rem]">
              <Field label="Description" htmlFor="cn-desc">
                <Input
                  id="cn-desc"
                  placeholder="e.g. Discount for late delivery"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Field label={`Amount (${invoice.currency})`} htmlFor="cn-amount">
                <Input
                  id="cn-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field
                label="Tax %"
                htmlFor="cn-tax"
                error={taxInvalid ? "0–100" : undefined}
              >
                <Input
                  id="cn-tax"
                  inputMode="decimal"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </Field>
            </div>
          ) : null}

          <Field
            label="Reason"
            htmlFor="cn-reason"
            hint="Shown on the credit note."
          >
            <Textarea
              id="cn-reason"
              rows={2}
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {credit > 0 ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <Label className="sr-only">Effect</Label>
              {tooMuch ? (
                <p className="text-destructive">
                  That&apos;s more than the {fmt(left)} left to credit.
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  <li className="flex justify-between gap-2">
                    <span>Total credit</span>
                    <span className="font-medium tabular-nums">
                      {fmt(credit)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2 text-muted-foreground">
                    <span>Lowers what they owe by</span>
                    <span className="tabular-nums">{fmt(split.applied)}</span>
                  </li>
                  {split.refund > 0 ? (
                    <li className="flex justify-between gap-2 text-muted-foreground">
                      <span>Already paid: refund due</span>
                      <span className="tabular-nums">{fmt(split.refund)}</span>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          ) : null}
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
            form="credit-note-form"
            disabled={create.isPending || !valid}
          >
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
