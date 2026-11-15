"use client"

import { type Contract, SAMPLE_CONTRACT_TEMPLATE } from "@workspace/contracts"
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
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { useClients } from "@/features/clients"
import { useProjects } from "@/features/projects"
import { useQuote, useQuotes } from "@/features/quotes"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import { useCreateContract, useUpdateContract } from "../api/mutations"
import { useContractTemplates } from "../api/queries"
import { ContractBodyField } from "./contract-body-field"

const NONE = "none"
const SAMPLE = "sample"

type Values = {
  clientId: string
  title: string
  quoteId: string
  projectId: string
  effectiveDate: string
  endDate: string
  body: string
}

/** Pick from a map of id → label, with a "None" choice. */
function OptionalSelect({
  id,
  value,
  onChange,
  items,
  placeholder,
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  items: Record<string, string>
  placeholder: string
  disabled?: boolean
}) {
  const all = { [NONE]: "None", ...items }
  return (
    <Select
      items={all}
      value={value || NONE}
      onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(all).map(([k, label]) => (
          <SelectItem key={k} value={k}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Create a draft (no `contract`) or edit one. */
export function ContractEditor({
  contract,
  initialClientId,
  initialQuoteId,
}: {
  contract?: Contract
  initialClientId?: string
  initialQuoteId?: string
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const clients = useClients({ status: "active" }, 100)
  const clientOptions = clients.data?.pages.flatMap((p) => p.items) ?? []
  const templates = useContractTemplates()
  const fromQuote = useQuote(initialQuoteId ?? "")
  const create = useCreateContract()
  const update = useUpdateContract(contract?.id ?? "")

  const form = useForm<Values>({
    defaultValues: contract
      ? {
          clientId: contract.clientId,
          title: contract.title,
          quoteId: contract.quoteId ?? "",
          projectId: contract.projectId ?? "",
          effectiveDate: contract.effectiveDate ?? "",
          endDate: contract.endDate ?? "",
          body: contract.body,
        }
      : {
          clientId: initialClientId ?? "",
          title: "",
          quoteId: initialQuoteId ?? "",
          projectId: "",
          effectiveDate: "",
          endDate: "",
          body: "",
        },
  })
  const { register, control, handleSubmit, formState, setValue, getValues } =
    form
  const clientId = useWatch({ control, name: "clientId" })

  // Starting from a quote: take its client and title.
  React.useEffect(() => {
    const q = fromQuote.data
    if (contract || !q) return
    setValue("clientId", q.clientId)
    if (!getValues("title")) setValue("title", q.title ?? "")
  }, [contract, fromQuote.data, setValue, getValues])

  const quotes = useQuotes({ clientId: clientId || undefined }, 50)
  const projects = useProjects({ clientId: clientId || undefined }, 50)
  const quoteItems = Object.fromEntries(
    (quotes.data?.pages.flatMap((p) => p.items) ?? [])
      .filter((q) => q.status !== "draft")
      .map((q) => [q.id, `${q.number}${q.title ? ` · ${q.title}` : ""}`])
  )
  const projectItems = Object.fromEntries(
    (projects.data?.pages.flatMap((p) => p.items) ?? []).map((p) => [
      p.id,
      p.name,
    ])
  )

  const [templateId, setTemplateId] = React.useState("")
  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const t =
      id === SAMPLE
        ? SAMPLE_CONTRACT_TEMPLATE
        : templates.data?.find((x) => x.id === id)
    if (!t) return
    setValue("body", t.body, { shouldDirty: true })
    if (!getValues("title")) setValue("title", t.name)
  }

  const onSubmit = handleSubmit(async (v) => {
    const common = {
      title: v.title.trim() || undefined,
      body: v.body,
      quoteId: v.quoteId || null,
      projectId: v.projectId || null,
      effectiveDate: v.effectiveDate || null,
      endDate: v.endDate || null,
    }
    try {
      const saved = contract
        ? await update.mutateAsync({
            ...common,
            title: common.title ?? contract.title,
          })
        : await create.mutateAsync({
            ...common,
            clientId: v.clientId,
            templateId:
              templateId && templateId !== SAMPLE ? templateId : undefined,
          })
      toast.success(contract ? "Contract saved" : "Draft contract created")
      router.push(`/${slug}/contracts/${saved.id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  if (clients.isPending || templates.isPending)
    return <Skeleton className="h-96 w-full" />

  const clientItems = Object.fromEntries(
    clientOptions.map((c) => [c.id, c.name])
  )
  const templateItems: Record<string, string> = {
    ...Object.fromEntries((templates.data ?? []).map((t) => [t.id, t.name])),
    [SAMPLE]: `Sample: ${SAMPLE_CONTRACT_TEMPLATE.name}`,
  }
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
                onValueChange={(v) => {
                  field.onChange(v ?? "")
                  setValue("quoteId", "")
                  setValue("projectId", "")
                }}
                disabled={Boolean(contract)}
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
          hint="e.g. Website redesign agreement"
        >
          <Input id="title" {...register("title")} />
        </Field>
        {contract ? null : (
          <Field
            label="Start from"
            htmlFor="template"
            hint="Copies the template's text into this contract"
          >
            <Select
              items={templateItems}
              value={templateId || null}
              onValueChange={(v) => v && applyTemplate(v)}
            >
              <SelectTrigger id="template" className="w-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(templateItems).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Quote" htmlFor="quoteId" hint="Fills {{quote.*}} fields">
          <Controller
            control={control}
            name="quoteId"
            render={({ field }) => (
              <OptionalSelect
                id="quoteId"
                value={field.value}
                onChange={field.onChange}
                items={quoteItems}
                placeholder="None"
                disabled={!clientId}
              />
            )}
          />
        </Field>
        <Field label="Project" htmlFor="projectId">
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <OptionalSelect
                id="projectId"
                value={field.value}
                onChange={field.onChange}
                items={projectItems}
                placeholder="None"
                disabled={!clientId}
              />
            )}
          />
        </Field>
        <Field label="Starts" htmlFor="effectiveDate">
          <Input
            id="effectiveDate"
            type="date"
            {...register("effectiveDate")}
          />
        </Field>
        <Field label="Ends" htmlFor="endDate" hint="Optional">
          <Input id="endDate" type="date" {...register("endDate")} />
        </Field>
      </div>

      <Field label="Contract text" htmlFor="body">
        <Controller
          control={control}
          name="body"
          rules={{
            validate: (v) => v.trim().length > 0 || "Write the contract text",
          }}
          render={({ field }) => (
            <ContractBodyField
              id="body"
              value={field.value}
              onChange={field.onChange}
              error={formState.errors.body?.message}
            />
          )}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(
              contract
                ? `/${slug}/contracts/${contract.id}`
                : `/${slug}/contracts`
            )
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : contract ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </form>
  )
}
