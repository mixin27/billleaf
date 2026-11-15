"use client"

import { documentTotals, lineAmounts } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  type Control,
  useFieldArray,
  type UseFormRegister,
  useWatch,
} from "react-hook-form"

import { money } from "@/lib/format"

import { emptyLine, type LineFormValues, parseLine } from "./line-items"

type WithLines = { lines: LineFormValues[] }

/**
 * Line items + live totals for any form with a `lines` field array.
 * Totals use the same shared math as the API, so the preview is exact.
 */
export function LineItemsEditor<T extends WithLines>({
  control: formControl,
  register: formRegister,
  currency,
  locale,
  defaultTaxBps = 0,
  submitted,
}: {
  control: Control<T>
  register: UseFormRegister<T>
  currency: string
  locale?: string
  defaultTaxBps?: number
  submitted: boolean
}) {
  // Any form with a `lines` array works; narrow once for the field paths below.
  const control = formControl as unknown as Control<WithLines>
  const register = formRegister as unknown as UseFormRegister<WithLines>
  const lines = useFieldArray<WithLines>({ control, name: "lines" })
  const watched =
    (useWatch({ control, name: "lines" }) as LineFormValues[] | undefined) ?? []
  const parsed = watched.map((l) => parseLine(l, currency))
  const totals = documentTotals(
    parsed.map((l) => ({
      quantity: l.quantity ?? 0,
      unitPrice: l.unitPrice ?? 0,
      taxRateBps: l.taxRateBps ?? 0,
    }))
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Line items</h2>
      <div className="hidden grid-cols-[1fr_90px_130px_90px_120px_32px] gap-2 text-xs text-muted-foreground md:grid">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span>Tax %</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      {lines.fields.map((field, i) => {
        const p = parsed[i]
        const amount =
          p && p.quantity !== null && p.unitPrice !== null
            ? lineAmounts({
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                taxRateBps: 0,
              }).amount
            : null
        return (
          <div
            key={field.id}
            className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[1fr_90px_130px_90px_120px_32px] md:items-start md:border-0 md:p-0"
          >
            <Textarea
              aria-label="Description"
              rows={1}
              className="col-span-2 min-h-8 md:col-span-1"
              placeholder="Description"
              aria-invalid={submitted && !p?.description}
              {...register(`lines.${i}.description`)}
            />
            <Input
              aria-label="Quantity"
              inputMode="decimal"
              aria-invalid={p?.quantity === null}
              {...register(`lines.${i}.quantity`)}
            />
            <Input
              aria-label="Unit price"
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={p?.unitPrice === null}
              {...register(`lines.${i}.unitPrice`)}
            />
            <Input
              aria-label="Tax rate %"
              inputMode="decimal"
              placeholder="0"
              aria-invalid={p?.taxRateBps === null}
              {...register(`lines.${i}.taxRate`)}
            />
            <p className="self-center text-right text-sm tabular-nums">
              {amount === null ? "—" : money(amount, currency, locale)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove line"
              disabled={lines.fields.length === 1}
              onClick={() => lines.remove(i)}
            >
              ✕
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => lines.append(emptyLine(defaultTaxBps))}
      >
        Add line
      </Button>

      <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right tabular-nums">
          {money(totals.subtotal, currency, locale)}
        </dd>
        <dt className="text-muted-foreground">Tax</dt>
        <dd className="text-right tabular-nums">
          {money(totals.taxTotal, currency, locale)}
        </dd>
        <dt className="font-medium">Total</dt>
        <dd className="text-right font-medium tabular-nums">
          {money(totals.total, currency, locale)}
        </dd>
      </dl>
    </section>
  )
}

/** True when every line parses (used to enable the save button). */
export function useLinesValid<T extends WithLines>(
  formControl: Control<T>,
  currency: string
) {
  const control = formControl as unknown as Control<WithLines>
  const watched =
    (useWatch({ control, name: "lines" }) as LineFormValues[] | undefined) ?? []
  return watched
    .map((l) => parseLine(l, currency))
    .every(
      (l) =>
        l.quantity !== null && l.unitPrice !== null && l.taxRateBps !== null
    )
}
