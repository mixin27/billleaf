"use client"

import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_RECEIPT_MAX_BYTES,
  type Expense,
  type ExpensePaymentMethod,
  fromMinorUnits,
  toMinorUnits,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { useProjects } from "@/features/projects"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import {
  useExpenseCategories,
  useRemoveReceipt,
  useSaveExpense,
  useUploadReceipt,
} from "../api/queries"

const NONE = "__none__"
const RECEIPT_TYPES = "image/png,image/jpeg,application/pdf"

/** Record (no `expense`) or edit an expense, with an optional receipt. */
export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  today,
  defaultClientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: Expense | null
  today: string
  defaultClientId?: string
}) {
  const profile = useWorkspaceProfile()
  const categories = useExpenseCategories()
  const clients = useClients({ status: "active", pageSize: 100 }, open)
  const save = useSaveExpense()
  const upload = useUploadReceipt()
  const removeReceipt = useRemoveReceipt()
  const locked = Boolean(expense?.invoiceId)

  const [spentOn, setSpentOn] = React.useState(today)
  const [vendor, setVendor] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [categoryId, setCategoryId] = React.useState(NONE)
  const [amount, setAmount] = React.useState("")
  const [tax, setTax] = React.useState("")
  const [currency, setCurrency] = React.useState<string | null>(null)
  const [method, setMethod] =
    React.useState<ExpensePaymentMethod>("bank_transfer")
  const [reference, setReference] = React.useState("")
  const [clientId, setClientId] = React.useState(NONE)
  const [projectId, setProjectId] = React.useState(NONE)
  const [billable, setBillable] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) return
    const cur = expense?.currency ?? null
    setSpentOn(expense?.spentOn ?? today)
    setVendor(expense?.vendor ?? "")
    setDescription(expense?.description ?? "")
    setCategoryId(expense?.categoryId ?? NONE)
    setAmount(expense && cur ? fromMinorUnits(expense.amount, cur) : "")
    setTax(
      expense && cur && expense.taxAmount
        ? fromMinorUnits(expense.taxAmount, cur)
        : ""
    )
    setCurrency(cur)
    setMethod(expense?.paymentMethod ?? "bank_transfer")
    setReference(expense?.reference ?? "")
    setClientId(expense?.clientId ?? defaultClientId ?? NONE)
    setProjectId(expense?.projectId ?? NONE)
    setBillable(expense?.billable ?? Boolean(defaultClientId))
    setFile(null)
  }, [open, expense, today, defaultClientId])

  const clientOptions = clients.data?.items ?? []
  const client = clientOptions.find((c) => c.id === clientId)
  const effectiveCurrency =
    currency ?? client?.currency ?? profile.data?.defaultCurrency ?? "USD"
  const projects = useProjects(
    {
      pageSize: 100,
      status: "active",
      ...(clientId !== NONE ? { clientId } : {}),
    },
    open
  )
  const projectOptions = projects.data?.items ?? []

  const minor = amount ? toMinorUnits(amount, effectiveCurrency) : null
  const taxMinor = tax ? toMinorUnits(tax, effectiveCurrency) : 0
  const amountInvalid = minor === null || minor < 1
  const taxInvalid =
    taxMinor === null || taxMinor < 0 || (minor !== null && taxMinor > minor)
  const fileInvalid = Boolean(file && file.size > EXPENSE_RECEIPT_MAX_BYTES)
  const pending = save.isPending || upload.isPending

  const submit = async () => {
    try {
      const saved = await save.mutateAsync({
        id: expense?.id,
        spentOn,
        vendor,
        description,
        categoryId: categoryId === NONE ? null : categoryId,
        ...(locked
          ? {}
          : {
              amount: minor!,
              taxAmount: taxMinor ?? 0,
              currency: effectiveCurrency,
              clientId: clientId === NONE ? null : clientId,
              billable: clientId !== NONE && billable,
            }),
        paymentMethod: method,
        reference,
        projectId: projectId === NONE ? null : projectId,
      })
      if (file) await upload.mutateAsync({ id: saved.id, file })
      toast.success(expense ? "Expense saved" : "Expense recorded")
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "New expense"}</DialogTitle>
          <DialogDescription>
            {locked
              ? `On invoice ${expense?.invoiceNumber ?? "(draft)"}: the amount and client can't change.`
              : "The total you paid, tax included."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="expense-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if ((!locked && (amountInvalid || taxInvalid)) || fileInvalid)
              return
            void submit()
          }}
        >
          <Field label="Date" htmlFor="ex-date">
            <Input
              id="ex-date"
              type="date"
              required
              value={spentOn}
              onChange={(e) => setSpentOn(e.target.value)}
            />
          </Field>
          <Field label="Vendor" htmlFor="ex-vendor" hint="Who you paid.">
            <Input
              id="ex-vendor"
              autoFocus
              maxLength={200}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </Field>
          <Field
            label={`Amount (${effectiveCurrency})`}
            htmlFor="ex-amount"
            error={
              !locked && amount && amountInvalid
                ? "Enter a valid amount"
                : undefined
            }
          >
            <Input
              id="ex-amount"
              inputMode="decimal"
              required
              disabled={locked}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field
            label="Of which tax"
            htmlFor="ex-tax"
            hint="Optional, for the tax summary."
            error={!locked && tax && taxInvalid ? "Check the tax" : undefined}
          >
            <Input
              id="ex-tax"
              inputMode="decimal"
              disabled={locked}
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </Field>
          <Field label="Category" htmlFor="ex-category">
            <Select
              items={{
                [NONE]: "No category",
                ...Object.fromEntries(
                  (categories.data ?? []).map((c) => [c.id, c.name])
                ),
              }}
              value={categoryId}
              onValueChange={(v) => setCategoryId(String(v ?? NONE))}
            >
              <SelectTrigger id="ex-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {(categories.data ?? [])
                  .filter((c) => !c.archived || c.id === categoryId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency" htmlFor="ex-currency">
            <CurrencySelect
              id="ex-currency"
              value={effectiveCurrency}
              disabled={locked}
              onChange={(v) => setCurrency(v)}
            />
          </Field>
          <Field label="Paid with" htmlFor="ex-method">
            <Select
              items={EXPENSE_PAYMENT_METHOD_LABELS}
              value={method}
              onValueChange={(v) => v && setMethod(v as ExpensePaymentMethod)}
            >
              <SelectTrigger id="ex-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_PAYMENT_METHOD_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Reference"
            htmlFor="ex-ref"
            hint="Receipt or transaction no."
          >
            <Input
              id="ex-ref"
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <Field label="Client" htmlFor="ex-client">
            <Select
              items={{
                [NONE]: "No client",
                ...Object.fromEntries(clientOptions.map((c) => [c.id, c.name])),
              }}
              value={clientId}
              disabled={locked}
              onValueChange={(v) => {
                setClientId(String(v ?? NONE))
                setProjectId(NONE)
              }}
            >
              <SelectTrigger id="ex-client" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No client</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Project" htmlFor="ex-project">
            <Select
              items={{
                [NONE]: "No project",
                ...Object.fromEntries(
                  projectOptions.map((p) => [p.id, p.name])
                ),
              }}
              value={projectId}
              onValueChange={(v) => setProjectId(String(v ?? NONE))}
            >
              <SelectTrigger id="ex-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox
              id="ex-billable"
              checked={clientId !== NONE && billable}
              disabled={locked || clientId === NONE}
              onCheckedChange={(c) => setBillable(Boolean(c))}
            />
            <Label
              htmlFor="ex-billable"
              className="flex flex-col items-start gap-0"
            >
              <span>Bill this to the client</span>
              <span className="text-xs font-normal text-muted-foreground">
                {clientId === NONE
                  ? "Pick a client first."
                  : "It can be added to their next invoice."}
              </span>
            </Label>
          </div>
          <Field label="Notes" htmlFor="ex-notes" className="sm:col-span-2">
            <Textarea
              id="ex-notes"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field
            label="Receipt"
            htmlFor="ex-receipt"
            className="sm:col-span-2"
            hint="Photo (PNG/JPEG) or PDF, up to 5 MB."
            error={fileInvalid ? "That file is larger than 5 MB" : undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                id="ex-receipt"
                type="file"
                accept={RECEIPT_TYPES}
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                {file || expense?.receipt ? "Replace" : "Attach receipt"}
              </Button>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {file ? (
                  file.name
                ) : expense?.receipt ? (
                  <a
                    className="underline"
                    href={expense.receipt.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {expense.receipt.filename}
                  </a>
                ) : (
                  "None"
                )}
              </span>
              {expense?.receipt && !file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removeReceipt.isPending}
                  onClick={() =>
                    removeReceipt.mutate(expense.id, {
                      onSuccess: () => toast.success("Receipt removed"),
                      onError: (err) => toast.error(errorMessage(err)),
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </Field>
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
            form="expense-form"
            disabled={
              pending ||
              fileInvalid ||
              (!locked && (amountInvalid || Boolean(tax && taxInvalid)))
            }
          >
            {pending ? "Saving…" : expense ? "Save" : "Record expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
