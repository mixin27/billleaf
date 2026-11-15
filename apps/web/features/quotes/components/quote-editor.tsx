"use client"

import {
  documentTotals,
  fromMinorUnits,
  lineAmounts,
  type Quote,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { useClients } from "@/features/clients"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useCreateQuote, useUpdateQuote } from "../api/mutations"

type LineValues = {
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}
type Values = {
  clientId: string
  title: string
  currency: string | null
  issueDate: string
  validUntil: string
  notes: string
  terms: string
  lines: LineValues[]
}

const emptyLine = (taxBps = 0): LineValues => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: taxBps ? String(taxBps / 100) : "",
})

/** Parse a line's strings; null fields mean "invalid" (shown inline). */
function parseLine(l: LineValues, currency: string) {
  const quantity = Number.parseFloat(l.quantity)
  const unitPrice = toMinorUnits(l.unitPrice || "0", currency)
  const taxRateBps = Math.round(Number.parseFloat(l.taxRate || "0") * 100)
  return {
    description: l.description.trim(),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unitPrice: unitPrice !== null && unitPrice >= 0 ? unitPrice : null,
    taxRateBps:
      Number.isFinite(taxRateBps) && taxRateBps >= 0 && taxRateBps <= 10_000
        ? taxRateBps
        : null,
  }
}

function toValues(q: Quote): Values {
  return {
    clientId: q.clientId,
    title: q.title ?? "",
    currency: q.currency,
    issueDate: q.issueDate,
    validUntil: q.validUntil ?? "",
    notes: q.notes ?? "",
    terms: q.terms ?? "",
    lines: q.lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: fromMinorUnits(l.unitPrice, q.currency),
      taxRate: l.taxRateBps ? String(l.taxRateBps / 100) : "",
    })),
  }
}

/** Create a new draft (no `quote`) or edit an existing draft. */
export function QuoteEditor({
  quote,
  initialClientId,
}: {
  quote?: Quote
  initialClientId?: string
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const clients = useClients({ status: "active" }, 100)
  const clientOptions = clients.data?.pages.flatMap((p) => p.items) ?? []
  const create = useCreateQuote()
  const update = useUpdateQuote(quote?.id ?? "")

  const form = useForm<Values>({
    defaultValues: quote
      ? toValues(quote)
      : {
          clientId: initialClientId ?? "",
          title: "",
          currency: null,
          issueDate: "",
          validUntil: "",
          notes: "",
          terms: "",
          lines: [emptyLine()],
        },
  })
  const { register, control, handleSubmit, formState, setValue } = form
  const lines = useFieldArray({ control, name: "lines" })

  // Default the currency to the client's, else the workspace's (new quotes only).
  const clientId = useWatch({ control, name: "clientId" })
  const chosenCurrency = useWatch({ control, name: "currency" })
  React.useEffect(() => {
    if (quote || formState.dirtyFields.currency) return
    const client = clientOptions.find((c) => c.id === clientId)
    setValue(
      "currency",
      client?.currency ?? profile.data?.defaultCurrency ?? null
    )
  }, [
    quote,
    clientId,
    clientOptions,
    profile.data?.defaultCurrency,
    setValue,
    formState.dirtyFields.currency,
  ])

  // New quotes: first line inherits the workspace default tax rate.
  React.useEffect(() => {
    if (
      !quote &&
      profile.data?.defaultTaxRateBps &&
      !form.getValues("lines.0.taxRate")
    ) {
      setValue("lines.0.taxRate", String(profile.data.defaultTaxRateBps / 100))
    }
  }, [quote, profile.data?.defaultTaxRateBps, setValue, form])

  const currency = chosenCurrency ?? profile.data?.defaultCurrency ?? "USD"
  const watchedLines = useWatch({ control, name: "lines" }) ?? []
  const parsed = watchedLines.map((l) => parseLine(l, currency))
  const valid = parsed.every(
    (l) => l.quantity !== null && l.unitPrice !== null && l.taxRateBps !== null
  )
  const totals = documentTotals(
    parsed.map((l) => ({
      quantity: l.quantity ?? 0,
      unitPrice: l.unitPrice ?? 0,
      taxRateBps: l.taxRateBps ?? 0,
    }))
  )
  const locale = profile.data?.locale

  const onSubmit = handleSubmit(async (v) => {
    const parsedLines = v.lines.map((l) => parseLine(l, currency))
    if (
      parsedLines.some(
        (l) =>
          !l.description ||
          l.quantity === null ||
          l.unitPrice === null ||
          l.taxRateBps === null
      )
    ) {
      toast.error("Fix the highlighted line items")
      return
    }
    const body = {
      clientId: v.clientId,
      title: v.title,
      currency,
      issueDate: v.issueDate || undefined,
      // New quote: blank → API default (issue + 30 days). Editing: blank → no expiry.
      validUntil: v.validUntil || (quote ? null : undefined),
      notes: v.notes,
      terms: v.terms,
      lines: parsedLines.map((l) => ({
        description: l.description,
        quantity: l.quantity!,
        unitPrice: l.unitPrice!,
        taxRateBps: l.taxRateBps!,
      })),
    }
    try {
      const saved = quote
        ? await update.mutateAsync(body)
        : await create.mutateAsync(body)
      toast.success(quote ? "Quote saved" : "Draft quote created")
      router.push(`/${slug}/quotes/${saved.id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  if (profile.isPending || clients.isPending)
    return <Skeleton className="h-96 w-full" />

  const clientItems = Object.fromEntries(
    clientOptions.map((c) => [c.id, c.name])
  )
  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Client"
          htmlFor="clientId"
          error={formState.errors.clientId?.message}
        >
          <Controller
            control={control}
            name="clientId"
            rules={{ required: "Choose a client" }}
            render={({ field }) => (
              <Select
                items={clientItems}
                value={field.value || null}
                onValueChange={(v) => field.onChange(v ?? "")}
              >
                <SelectTrigger id="clientId" className="w-full">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clientOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {clientOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active clients.{" "}
              <Link className="underline" href={`/${slug}/clients`}>
                Add one first
              </Link>
              .
            </p>
          ) : null}
        </Field>
        <Field
          label="Title"
          htmlFor="title"
          hint="Optional, e.g. Website redesign"
        >
          <Input id="title" {...register("title")} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <CurrencySelect
                id="currency"
                value={field.value}
                onChange={(v) => field.onChange(v)}
              />
            )}
          />
        </Field>
        <Field
          label="Issue date"
          htmlFor="issueDate"
          hint={quote ? undefined : "Blank = today"}
        >
          <Input id="issueDate" type="date" {...register("issueDate")} />
        </Field>
        <Field
          label="Valid until"
          htmlFor="validUntil"
          hint={quote ? undefined : "Blank = 30 days after issue"}
        >
          <Input id="validUntil" type="date" {...register("validUntil")} />
        </Field>
      </div>

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
                aria-invalid={formState.isSubmitted && !p?.description}
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
          onClick={() =>
            lines.append(emptyLine(profile.data?.defaultTaxRateBps))
          }
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Notes"
          htmlFor="notes"
          hint="Shown to the client on the quote."
        >
          <Textarea id="notes" rows={4} {...register("notes")} />
        </Field>
        <Field
          label="Terms"
          htmlFor="terms"
          hint="Payment schedule, scope, conditions."
        >
          <Textarea id="terms" rows={4} {...register("terms")} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              quote ? `/${slug}/quotes/${quote.id}` : `/${slug}/quotes`
            )
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Saving…" : quote ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </form>
  )
}
