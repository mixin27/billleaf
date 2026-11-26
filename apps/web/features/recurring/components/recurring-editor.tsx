"use client"

import type {
  RecurrenceUnit,
  RecurringInvoice,
  RecurringMode,
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
  emptyLine,
  type LineFormValues,
  toApiLines,
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

import { useCreateRecurring, useUpdateRecurring } from "../api/mutations"

/** Frequency presets, encoded as "every:unit". */
const FREQUENCIES: Record<string, string> = {
  "1:week": "Weekly",
  "2:week": "Every 2 weeks",
  "1:month": "Monthly",
  "3:month": "Quarterly",
  "6:month": "Every 6 months",
  "1:year": "Yearly",
}
const MODES: Record<RecurringMode, string> = {
  draft: "Create a draft for me to review",
  send: "Issue and email it automatically",
}
const ENDS = {
  never: "Never",
  count: "After a number of invoices",
  date: "On a date",
} as const
type End = keyof typeof ENDS

type Values = {
  clientId: string
  title: string
  currency: string | null
  frequency: string
  startDate: string
  end: End
  endDate: string
  maxOccurrences: string
  dueDays: string
  mode: RecurringMode
  notes: string
  terms: string
  lines: LineFormValues[]
}

function toValues(r: RecurringInvoice): Values {
  const frequency = `${r.every}:${r.unit}`
  return {
    clientId: r.clientId,
    title: r.title ?? "",
    currency: r.currency,
    frequency: FREQUENCIES[frequency] ? frequency : "1:month",
    startDate: r.startDate,
    end: r.maxOccurrences ? "count" : r.endDate ? "date" : "never",
    endDate: r.endDate ?? "",
    maxOccurrences: r.maxOccurrences ? String(r.maxOccurrences) : "",
    dueDays: r.dueDays === null ? "" : String(r.dueDays),
    mode: r.mode,
    notes: r.notes ?? "",
    terms: r.terms ?? "",
    lines: toLineFormValues(r.lines, r.currency),
  }
}

const today = () => new Date().toISOString().slice(0, 10)

/** Create a schedule (no `schedule`) or edit one. */
export function RecurringEditor({ schedule }: { schedule?: RecurringInvoice }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const clients = useClients({ status: "active", pageSize: 100 })
  const clientOptions = clients.data?.items ?? []
  const create = useCreateRecurring()
  const update = useUpdateRecurring(schedule?.id ?? "")

  const form = useForm<Values>({
    defaultValues: schedule
      ? toValues(schedule)
      : {
          clientId: "",
          title: "",
          currency: null,
          frequency: "1:month",
          startDate: today(),
          end: "never",
          endDate: "",
          maxOccurrences: "",
          dueDays: "",
          mode: "draft",
          notes: "",
          terms: "",
          lines: [emptyLine()],
        },
  })
  const { register, control, handleSubmit, formState, setValue } = form

  const clientId = useWatch({ control, name: "clientId" })
  const chosenCurrency = useWatch({ control, name: "currency" })
  const end = useWatch({ control, name: "end" })
  React.useEffect(() => {
    if (schedule || formState.dirtyFields.currency) return
    const client = clientOptions.find((c) => c.id === clientId)
    setValue(
      "currency",
      client?.currency ?? profile.data?.defaultCurrency ?? null
    )
  }, [
    schedule,
    clientId,
    clientOptions,
    profile.data?.defaultCurrency,
    setValue,
    formState.dirtyFields.currency,
  ])

  const currency = chosenCurrency ?? profile.data?.defaultCurrency ?? "USD"
  const valid = useLinesValid(control, currency)

  const onSubmit = handleSubmit(async (v) => {
    const lines = toApiLines(v.lines, currency)
    if (!lines) {
      toast.error("Fix the highlighted line items")
      return
    }
    const [every, unit] = v.frequency.split(":") as [string, RecurrenceUnit]
    const common = {
      title: v.title,
      currency,
      lines,
      every: Number(every),
      unit,
      endDate: v.end === "date" && v.endDate ? v.endDate : null,
      maxOccurrences:
        v.end === "count" && v.maxOccurrences ? Number(v.maxOccurrences) : null,
      dueDays: v.dueDays === "" ? null : Number(v.dueDays),
      mode: v.mode,
      notes: v.notes,
      terms: v.terms,
    }
    try {
      const saved = schedule
        ? await update.mutateAsync(common)
        : await create.mutateAsync({
            ...common,
            clientId: v.clientId,
            startDate: v.startDate,
          })
      toast.success(schedule ? "Schedule saved" : "Recurring invoice created")
      router.push(`/${slug}/invoices/recurring/${saved.id}`)
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
                disabled={Boolean(schedule)}
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
          hint="Optional, e.g. Monthly retainer"
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
        <Field label="Frequency" htmlFor="frequency">
          <Controller
            control={control}
            name="frequency"
            render={({ field }) => (
              <Select
                items={FREQUENCIES}
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? "1:month")}
              >
                <SelectTrigger id="frequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCIES).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field
          label="First invoice date"
          htmlFor="startDate"
          hint={
            schedule
              ? "Fixed once created"
              : "Later invoices keep this day of the month"
          }
        >
          <Controller
            control={control}
            name="startDate"
            render={({ field }) => (
              <DateInput
                id="startDate"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                required
                disabled={Boolean(schedule)}
              />
            )}
          />
        </Field>
        <Field
          label="Due after (days)"
          htmlFor="dueDays"
          hint="Blank = client/workspace payment terms"
        >
          <Input
            id="dueDays"
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            {...register("dueDays")}
          />
        </Field>
        <Field label="Ends" htmlFor="end">
          <Controller
            control={control}
            name="end"
            render={({ field }) => (
              <Select
                items={ENDS}
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? "never")}
              >
                <SelectTrigger id="end" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ENDS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {end === "count" ? (
          <Field label="Number of invoices" htmlFor="maxOccurrences">
            <Input
              id="maxOccurrences"
              type="number"
              min={1}
              max={1000}
              inputMode="numeric"
              {...register("maxOccurrences", { required: true })}
            />
          </Field>
        ) : end === "date" ? (
          <Field label="Last invoice on or before" htmlFor="endDate">
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <DateInput
                  id="endDate"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  required
                />
              )}
            />
          </Field>
        ) : null}
        <Field label="Each invoice" htmlFor="mode">
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <Select
                items={MODES}
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? "draft")}
              >
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODES).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <LineItemsEditor
        control={control}
        register={register}
        currency={currency}
        locale={profile.data?.locale}
        defaultTaxBps={profile.data?.defaultTaxRateBps}
        submitted={formState.isSubmitted}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Notes" htmlFor="notes" hint="Copied onto each invoice.">
          <Textarea id="notes" rows={4} {...register("notes")} />
        </Field>
        <Field label="Terms" htmlFor="terms" hint="Copied onto each invoice.">
          <Textarea id="terms" rows={4} {...register("terms")} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              schedule
                ? `/${slug}/invoices/recurring/${schedule.id}`
                : `/${slug}/invoices/recurring`
            )
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Saving…" : schedule ? "Save schedule" : "Create schedule"}
        </Button>
      </div>
    </form>
  )
}
