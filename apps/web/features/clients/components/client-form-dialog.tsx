"use client"

import type { Client } from "@workspace/contracts"
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
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { ApiError, errorMessage } from "@/lib/api"

import { useCreateClient, useUpdateClient } from "../api/mutations"

type Values = {
  type: "company" | "individual"
  name: string
  email: string
  phone: string
  website: string
  taxId: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  currency: string | null
  paymentTermsDays: string
  notes: string
}

const TEXT = [
  "name",
  "email",
  "phone",
  "website",
  "taxId",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "notes",
] as const

function toValues(c?: Client): Values {
  return {
    ...(Object.fromEntries(TEXT.map((k) => [k, c?.[k] ?? ""])) as Pick<
      Values,
      (typeof TEXT)[number]
    >),
    type: c?.type ?? "company",
    country: c?.country ?? "",
    currency: c?.currency ?? null,
    paymentTermsDays:
      c?.paymentTermsDays != null ? String(c.paymentTermsDays) : "",
  }
}

/** Create (no `client`) or edit a client. */
export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  client?: Client
  onSaved?: (client: Client) => void
}) {
  const create = useCreateClient()
  const update = useUpdateClient(client?.id ?? "")
  const form = useForm<Values>({ defaultValues: toValues(client) })
  const { register, handleSubmit, reset, setError, formState } = form
  const errors = formState.errors

  React.useEffect(() => {
    if (open) reset(toValues(client))
  }, [open, client, reset])

  const onSubmit = handleSubmit(async (v) => {
    const body = {
      ...Object.fromEntries(TEXT.map((k) => [k, v[k]])),
      name: v.name,
      type: v.type,
      country: v.country ? v.country.toUpperCase() : null,
      currency: v.currency,
      paymentTermsDays:
        v.paymentTermsDays === ""
          ? null
          : Number.parseInt(v.paymentTermsDays, 10),
    }
    try {
      const saved = client
        ? await update.mutateAsync(body)
        : await create.mutateAsync(body as never)
      toast.success(client ? "Client updated" : "Client created")
      onOpenChange(false)
      onSaved?.(saved)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        for (const [path, message] of Object.entries(e.fieldErrors)) {
          setError(path as keyof Values, { message })
        }
      }
      toast.error(errorMessage(e))
    }
  })

  const pending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{client ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            Details used on quotes and invoices for this client.
          </DialogDescription>
        </DialogHeader>
        <form
          id="client-form"
          onSubmit={onSubmit}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Type" htmlFor="type">
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select
                  items={{ company: "Company", individual: "Individual" }}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Name"
            htmlFor="client-name"
            error={errors.name?.message}
          >
            <Input
              id="client-name"
              autoFocus
              {...register("name", { required: "Required" })}
            />
          </Field>
          <Field
            label="Email"
            htmlFor="client-email"
            error={errors.email?.message}
          >
            <Input id="client-email" type="email" {...register("email")} />
          </Field>
          <Field
            label="Phone"
            htmlFor="client-phone"
            error={errors.phone?.message}
          >
            <Input id="client-phone" {...register("phone")} />
          </Field>
          <Field
            label="Website"
            htmlFor="client-website"
            error={errors.website?.message}
          >
            <Input
              id="client-website"
              placeholder="https://"
              {...register("website")}
            />
          </Field>
          <Field
            label="Tax ID"
            htmlFor="client-taxId"
            error={errors.taxId?.message}
          >
            <Input id="client-taxId" {...register("taxId")} />
          </Field>
          <Field
            label="Address line 1"
            htmlFor="client-a1"
            className="sm:col-span-2"
          >
            <Input id="client-a1" {...register("addressLine1")} />
          </Field>
          <Field
            label="Address line 2"
            htmlFor="client-a2"
            className="sm:col-span-2"
          >
            <Input id="client-a2" {...register("addressLine2")} />
          </Field>
          <Field label="City" htmlFor="client-city">
            <Input id="client-city" {...register("city")} />
          </Field>
          <Field label="State / region" htmlFor="client-state">
            <Input id="client-state" {...register("state")} />
          </Field>
          <Field label="Postal code" htmlFor="client-postal">
            <Input id="client-postal" {...register("postalCode")} />
          </Field>
          <Field
            label="Country"
            htmlFor="client-country"
            error={errors.country?.message}
            hint="2-letter code"
          >
            <Input
              id="client-country"
              maxLength={2}
              className="uppercase"
              {...register("country")}
            />
          </Field>
          <Field
            label="Currency"
            htmlFor="client-currency"
            error={errors.currency?.message}
          >
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <CurrencySelect
                  id="client-currency"
                  allowEmpty
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field
            label="Payment terms (days)"
            htmlFor="client-terms"
            error={errors.paymentTermsDays?.message}
            hint="Blank = workspace default"
          >
            <Input
              id="client-terms"
              type="number"
              min={0}
              max={365}
              {...register("paymentTermsDays")}
            />
          </Field>
          <Field
            label="Notes"
            htmlFor="client-notes"
            className="sm:col-span-2"
            hint="Internal only — never shown to the client."
          >
            <Textarea id="client-notes" rows={3} {...register("notes")} />
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
          <Button type="submit" form="client-form" disabled={pending}>
            {pending ? "Saving…" : client ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
