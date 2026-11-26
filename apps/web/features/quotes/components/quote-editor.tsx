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
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  type DiscountFormValues,
  emptyLine,
  type LineFormValues,
  parseDiscount,
  toApiLines,
  toDiscountFormValues,
  toLineFormValues,
} from "@/components/documents/line-items"
import {
  LineItemsEditor,
  useLinesValid,
} from "@/components/documents/line-items-editor"
import { DateInput } from "@/components/form/date-input"
import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { useClients } from "@/features/clients"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { money } from "@/lib/format"

import { useCreateQuote, useUpdateQuote } from "../api/mutations"

type Values = {
  clientId: string
  title: string
  currency: string | null
  issueDate: string
  validUntil: string
  notes: string
  terms: string
  lines: LineFormValues[]
} & DiscountFormValues

function toValues(q: Quote): Values {
  return {
    clientId: q.clientId,
    title: q.title ?? "",
    currency: q.currency,
    issueDate: q.issueDate,
    validUntil: q.validUntil ?? "",
    notes: q.notes ?? "",
    terms: q.terms ?? "",
    lines: toLineFormValues(q.lines, q.currency),
    ...toDiscountFormValues(q.discount, q.currency),
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
  const clients = useClients({ status: "active", pageSize: 100 })
  const clientOptions = clients.data?.items ?? []
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
          discountType: "none",
          discountValue: "",
        },
  })
  const { register, control, handleSubmit, formState, setValue } = form

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
  const valid = useLinesValid(control, currency)
  const locale = profile.data?.locale

  const onSubmit = handleSubmit(async (v) => {
    const apiLines = toApiLines(v.lines, currency)
    if (!apiLines) {
      toast.error("Fix the highlighted line items")
      return
    }
    const discount = parseDiscount(v, currency)
    if (discount === undefined) {
      toast.error("Fix the discount")
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
      lines: apiLines,
      discount,
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
          <Controller
            control={control}
            name="issueDate"
            render={({ field }) => (
              <DateInput
                id="issueDate"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Today"
              />
            )}
          />
        </Field>
        <Field
          label="Valid until"
          htmlFor="validUntil"
          hint={quote ? undefined : "Blank = 30 days after issue"}
        >
          <Controller
            control={control}
            name="validUntil"
            render={({ field }) => (
              <DateInput
                id="validUntil"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="30 days after issue"
              />
            )}
          />
        </Field>
      </div>

      <LineItemsEditor
        control={control}
        register={register}
        currency={currency}
        locale={locale}
        defaultTaxBps={profile.data?.defaultTaxRateBps}
        submitted={formState.isSubmitted}
      />

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
