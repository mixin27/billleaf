"use client"

import {
  fromMinorUnits,
  type Project,
  type ProjectBilling,
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
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { useClients } from "@/features/clients"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import { useCreateProject, useUpdateProject } from "../api/mutations"

const BILLING: Record<ProjectBilling, string> = {
  hourly: "Hourly",
  fixed: "Fixed price",
  non_billable: "Not billable",
}
const NO_CLIENT = "__internal__"

/** Create (no `project`) or edit a project. */
export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  initialClientId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project
  initialClientId?: string
  onSaved?: (p: Project) => void
}) {
  const profile = useWorkspaceProfile()
  const clients = useClients({ status: "active" }, 100)
  const clientOptions = clients.data?.pages.flatMap((p) => p.items) ?? []
  const create = useCreateProject()
  const update = useUpdateProject(project?.id ?? "")

  const [name, setName] = React.useState("")
  const [clientId, setClientId] = React.useState<string>(NO_CLIENT)
  const [billing, setBilling] = React.useState<ProjectBilling>("hourly")
  const [currency, setCurrency] = React.useState<string | null>(null)
  const [amount, setAmount] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [description, setDescription] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setName(project?.name ?? "")
    setClientId(project?.clientId ?? initialClientId ?? NO_CLIENT)
    setBilling(project?.billing ?? "hourly")
    setCurrency(project?.currency ?? null)
    const minor =
      project?.billing === "fixed" ? project.budgetAmount : project?.hourlyRate
    setAmount(
      minor != null && project ? fromMinorUnits(minor, project.currency) : ""
    )
    setStartDate(project?.startDate ?? "")
    setDueDate(project?.dueDate ?? "")
    setDescription(project?.description ?? "")
  }, [open, project, initialClientId])

  const client = clientOptions.find((c) => c.id === clientId)
  const effectiveCurrency =
    currency ?? client?.currency ?? profile.data?.defaultCurrency ?? "USD"
  const minor = amount ? toMinorUnits(amount, effectiveCurrency) : null
  const amountInvalid = Boolean(amount) && (minor === null || minor < 0)
  const pending = create.isPending || update.isPending

  const submit = () => {
    const body = {
      name,
      description,
      clientId: clientId === NO_CLIENT ? null : clientId,
      billing,
      currency: effectiveCurrency,
      budgetAmount: billing === "fixed" ? minor : null,
      hourlyRate: billing === "hourly" ? minor : null,
      startDate: startDate || null,
      dueDate: dueDate || null,
    }
    const done = (p: Project) => {
      toast.success(project ? "Project saved" : "Project created")
      onOpenChange(false)
      onSaved?.(p)
    }
    if (project)
      update.mutate(body, {
        onSuccess: done,
        onError: (e) => toast.error(errorMessage(e)),
      })
    else
      create.mutate(body, {
        onSuccess: done,
        onError: (e) => toast.error(errorMessage(e)),
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            Track the work you do for a client.
          </DialogDescription>
        </DialogHeader>
        <form
          id="project-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim() || amountInvalid) return
            submit()
          }}
        >
          <Field label="Name" htmlFor="project-name" className="sm:col-span-2">
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="Client" htmlFor="project-client">
            <Select
              items={{
                [NO_CLIENT]: "Internal (no client)",
                ...Object.fromEntries(clientOptions.map((c) => [c.id, c.name])),
              }}
              value={clientId}
              onValueChange={(v) => setClientId(String(v ?? NO_CLIENT))}
            >
              <SelectTrigger id="project-client" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>Internal (no client)</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Billing" htmlFor="project-billing">
            <Select
              items={BILLING}
              value={billing}
              onValueChange={(v) => v && setBilling(v as ProjectBilling)}
            >
              <SelectTrigger id="project-billing" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BILLING).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {billing !== "non_billable" ? (
            <>
              <Field
                label={
                  billing === "fixed"
                    ? `Fixed price (${effectiveCurrency})`
                    : `Hourly rate (${effectiveCurrency})`
                }
                htmlFor="project-amount"
                error={amountInvalid ? "Enter a valid amount" : undefined}
              >
                <Input
                  id="project-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="project-currency">
                <CurrencySelect
                  id="project-currency"
                  value={effectiveCurrency}
                  onChange={(v) => setCurrency(v)}
                />
              </Field>
            </>
          ) : null}
          <Field label="Start date" htmlFor="project-start">
            <Input
              id="project-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field
            label="Due date"
            htmlFor="project-due"
            error={
              startDate && dueDate && dueDate < startDate
                ? "Must be on or after the start date"
                : undefined
            }
          >
            <Input
              id="project-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            htmlFor="project-desc"
            className="sm:col-span-2"
          >
            <Textarea
              id="project-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            form="project-form"
            disabled={pending || !name.trim() || amountInvalid}
          >
            {pending ? "Saving…" : project ? "Save" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
