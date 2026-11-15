"use client"

import type { WorkspaceProfile } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { CurrencySelect } from "@/components/form/currency-select"
import { Field, FormSection } from "@/components/form/field"
import { ApiError, errorMessage } from "@/lib/api"

import { useUpdateWorkspaceProfile } from "../api/mutations"
import { useWorkspaceProfile } from "../api/queries"

/** Form values are all strings; converted to the API shape on submit. */
type Values = {
  name: string
  legalName: string
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
  defaultCurrency: string
  timezone: string
  locale: string
  paymentTermsDays: string
  taxRatePercent: string
  documentFooter: string
  brandColor: string
}

const TEXT_FIELDS = [
  "name",
  "legalName",
  "email",
  "phone",
  "website",
  "taxId",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "timezone",
  "locale",
  "documentFooter",
  "brandColor",
] as const

function toValues(p: WorkspaceProfile): Values {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, p[k] ?? ""])),
    country: p.country ?? "",
    defaultCurrency: p.defaultCurrency,
    paymentTermsDays: String(p.paymentTermsDays),
    taxRatePercent: (p.defaultTaxRateBps / 100).toString(),
  } as Values
}

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    return ["UTC"]
  }
}

export function WorkspaceProfileForm() {
  const profile = useWorkspaceProfile()
  const update = useUpdateWorkspaceProfile()
  const { can } = usePermissions()
  const readOnly = !can("workspace.update")
  const zones = React.useMemo(timeZones, [])

  const form = useForm<Values>()
  const { register, handleSubmit, reset, setError, formState } = form
  const errors = formState.errors

  React.useEffect(() => {
    if (profile.data) reset(toValues(profile.data))
  }, [profile.data, reset])

  const onSubmit = handleSubmit(async (v) => {
    const taxBps = Math.round(Number.parseFloat(v.taxRatePercent || "0") * 100)
    try {
      const saved = await update.mutateAsync({
        ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, v[k]])),
        name: v.name,
        country: v.country ? v.country.toUpperCase() : null,
        defaultCurrency: v.defaultCurrency,
        paymentTermsDays: Number.parseInt(v.paymentTermsDays || "0", 10),
        defaultTaxRateBps: Number.isFinite(taxBps) ? taxBps : 0,
      })
      reset(toValues(saved))
      toast.success("Workspace profile saved")
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        for (const [path, message] of Object.entries(e.fieldErrors)) {
          const field = path === "defaultTaxRateBps" ? "taxRatePercent" : path
          setError(field as keyof Values, { message })
        }
      }
      toast.error(errorMessage(e))
    }
  })

  if (profile.isPending) return <Skeleton className="h-96 w-full" />
  if (profile.error)
    return <p className="text-sm text-destructive">{profile.error.message}</p>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <fieldset disabled={readOnly} className="contents">
        <FormSection
          title="Business"
          description="Shown as the sender on quotes, invoices and receipts."
        >
          <Field
            label="Workspace name"
            htmlFor="name"
            error={errors.name?.message}
          >
            <Input id="name" {...register("name", { required: "Required" })} />
          </Field>
          <Field
            label="Legal name"
            htmlFor="legalName"
            error={errors.legalName?.message}
          >
            <Input id="legalName" {...register("legalName")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" {...register("email")} />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field
            label="Website"
            htmlFor="website"
            error={errors.website?.message}
          >
            <Input
              id="website"
              placeholder="https://"
              {...register("website")}
            />
          </Field>
          <Field label="Tax ID" htmlFor="taxId" error={errors.taxId?.message}>
            <Input id="taxId" {...register("taxId")} />
          </Field>
        </FormSection>

        <FormSection title="Address">
          <Field
            label="Address line 1"
            htmlFor="addressLine1"
            className="sm:col-span-2"
          >
            <Input id="addressLine1" {...register("addressLine1")} />
          </Field>
          <Field
            label="Address line 2"
            htmlFor="addressLine2"
            className="sm:col-span-2"
          >
            <Input id="addressLine2" {...register("addressLine2")} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" {...register("city")} />
          </Field>
          <Field label="State / region" htmlFor="state">
            <Input id="state" {...register("state")} />
          </Field>
          <Field label="Postal code" htmlFor="postalCode">
            <Input id="postalCode" {...register("postalCode")} />
          </Field>
          <Field
            label="Country"
            htmlFor="country"
            error={errors.country?.message}
            hint="2-letter code, e.g. US, SG, TH"
          >
            <Input
              id="country"
              maxLength={2}
              className="uppercase"
              {...register("country")}
            />
          </Field>
        </FormSection>

        <FormSection
          title="Defaults"
          description="Applied to new quotes and invoices. Clients can override currency and terms."
        >
          <Field label="Default currency" htmlFor="defaultCurrency">
            <Controller
              control={form.control}
              name="defaultCurrency"
              render={({ field }) => (
                <CurrencySelect
                  id="defaultCurrency"
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? "USD")}
                />
              )}
            />
          </Field>
          <Field
            label="Timezone"
            htmlFor="timezone"
            error={errors.timezone?.message}
          >
            <Input id="timezone" list="timezones" {...register("timezone")} />
            <datalist id="timezones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </Field>
          <Field
            label="Payment terms (days)"
            htmlFor="paymentTermsDays"
            error={errors.paymentTermsDays?.message}
          >
            <Input
              id="paymentTermsDays"
              type="number"
              min={0}
              max={365}
              {...register("paymentTermsDays")}
            />
          </Field>
          <Field
            label="Default tax rate (%)"
            htmlFor="taxRatePercent"
            error={errors.taxRatePercent?.message}
          >
            <Input
              id="taxRatePercent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              {...register("taxRatePercent")}
            />
          </Field>
          <Field
            label="Locale"
            htmlFor="locale"
            hint="Number and date format, e.g. en-US"
          >
            <Input id="locale" {...register("locale")} />
          </Field>
          <Field
            label="Brand color"
            htmlFor="brandColor"
            error={errors.brandColor?.message}
            hint="Hex, e.g. #142B2B"
          >
            <Input
              id="brandColor"
              placeholder="#142B2B"
              {...register("brandColor")}
            />
          </Field>
          <Field
            label="Document footer"
            htmlFor="documentFooter"
            className="sm:col-span-2"
            hint="Payment instructions or thank-you note printed on documents."
          >
            <Textarea
              id="documentFooter"
              rows={3}
              {...register("documentFooter")}
            />
          </Field>
        </FormSection>
      </fieldset>

      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          You can view but not edit these settings.
        </p>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!formState.isDirty || update.isPending}
            onClick={() => profile.data && reset(toValues(profile.data))}
          >
            Discard
          </Button>
          <Button
            type="submit"
            disabled={!formState.isDirty || update.isPending}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  )
}
