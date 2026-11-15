"use client"

import {
  PAYMENT_ACCOUNT_KIND_LABELS,
  type PaymentAccount,
  type PaymentAccountKind,
} from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { errorMessage } from "@/lib/api"

import {
  useDeletePaymentAccount,
  usePaymentAccounts,
  useRemoveQr,
  useReorderPaymentAccounts,
  useSavePaymentAccount,
  useUploadQr,
  type AccountsSource,
  AccountsSourceContext,
} from "../api/queries"

const QR_MAX = 1024 * 1024

/**
 * Settings → Payment methods: bank accounts and mobile wallets (KBZPay,
 * WavePay, AYA Pay…) shown on invoices, in invoice emails and in the client
 * portal, with optional QR codes.
 */
export function PaymentAccountsSettings({
  source = "workspace",
}: {
  /** "platform": Billleaf's own accounts (admin portal). */
  source?: AccountsSource
}) {
  return (
    <AccountsSourceContext.Provider value={source}>
      <AccountsList source={source} />
    </AccountsSourceContext.Provider>
  )
}

function AccountsList({ source }: { source: AccountsSource }) {
  const { can } = usePermissions()
  const editable = source === "platform" || can("workspace.update")
  const accounts = usePaymentAccounts()
  const reorder = useReorderPaymentAccounts()
  const [editing, setEditing] = React.useState<PaymentAccount | "new" | null>(
    null
  )
  const items = accounts.data ?? []

  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((a) => a.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id!)
    reorder.mutate(ids, { onError: (e) => toast.error(errorMessage(e)) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="text-base font-semibold">Payment methods</h2>
          <p className="text-sm text-muted-foreground">
            {source === "platform"
              ? "Where workspaces pay Billleaf for their plan. Shown on the pay page in Settings → Billing."
              : "How clients can pay you. They appear on invoices that have a balance, in invoice emails and in the client portal, where clients can upload a screenshot after paying."}
          </p>
        </div>
        {editable ? (
          <Button onClick={() => setEditing("new")}>Add payment method</Button>
        ) : null}
      </div>

      {accounts.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No payment methods yet. Add a bank account or a mobile wallet such as
          KBZPay or WavePay, with its QR code.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((a, i) => (
            <AccountCard
              key={a.id}
              account={a}
              editable={editable}
              first={i === 0}
              last={i === items.length - 1}
              onEdit={() => setEditing(a)}
              onMove={(by) => move(i, by)}
            />
          ))}
        </div>
      )}

      <AccountDialog
        account={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  )
}

function AccountCard({
  account: a,
  editable,
  first,
  last,
  onEdit,
  onMove,
}: {
  account: PaymentAccount
  editable: boolean
  first: boolean
  last: boolean
  onEdit: () => void
  onMove: (by: -1 | 1) => void
}) {
  const upload = useUploadQr()
  const removeQr = useRemoveQr()
  const remove = useDeletePaymentAccount()
  const input = React.useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = React.useState(false)
  const onError = (e: unknown) => toast.error(errorMessage(e))

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-4">
        {a.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
          <img
            src={a.qrUrl}
            alt={`${a.label} QR code`}
            className="size-20 rounded-md border bg-white object-contain p-1"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">
            No QR
          </div>
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{a.label}</p>
            <Badge variant="secondary">
              {PAYMENT_ACCOUNT_KIND_LABELS[a.kind]}
            </Badge>
            {!a.active ? <Badge variant="outline">Hidden</Badge> : null}
          </div>
          {a.accountName ? (
            <p className="text-muted-foreground">{a.accountName}</p>
          ) : null}
          {a.accountNumber ? (
            <p className="font-mono tabular-nums">{a.accountNumber}</p>
          ) : null}
          {a.instructions ? (
            <p className="mt-1 whitespace-pre-line text-muted-foreground">
              {a.instructions}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {a.currencies.length
              ? `For ${a.currencies.join(", ")} invoices`
              : "For invoices in any currency"}
          </p>
        </div>
        {editable ? (
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (!file) return
                if (file.size > QR_MAX)
                  return void toast.error("QR images must be 1 MB or smaller")
                upload.mutate(
                  { id: a.id, file },
                  { onSuccess: () => toast.success("QR code updated"), onError }
                )
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${a.label}`}
                  />
                }
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.8} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => input.current?.click()}>
                  {a.qrUrl ? "Replace QR code" : "Upload QR code"}
                </DropdownMenuItem>
                {a.qrUrl ? (
                  <DropdownMenuItem
                    onClick={() => removeQr.mutate(a.id, { onError })}
                  >
                    Remove QR code
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem disabled={first} onClick={() => onMove(-1)}>
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onClick={() => onMove(1)}>
                  Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirm(true)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </CardContent>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {a.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops showing on invoices and in the client portal. Payments
              already recorded aren't affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(a.id, {
                  onSuccess: () => toast.success("Payment method deleted"),
                  onError,
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function AccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: PaymentAccount | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const save = useSavePaymentAccount()
  const [kind, setKind] = React.useState<PaymentAccountKind>("mobile_wallet")
  const [label, setLabel] = React.useState("")
  const [accountName, setAccountName] = React.useState("")
  const [accountNumber, setAccountNumber] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [currencies, setCurrencies] = React.useState("")
  const [active, setActive] = React.useState(true)

  React.useEffect(() => {
    if (!open) return
    setKind(account?.kind ?? "mobile_wallet")
    setLabel(account?.label ?? "")
    setAccountName(account?.accountName ?? "")
    setAccountNumber(account?.accountNumber ?? "")
    setInstructions(account?.instructions ?? "")
    setCurrencies(account?.currencies.join(", ") ?? "")
    setActive(account?.active ?? true)
  }, [open, account])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {account ? `Edit ${account.label}` : "Add payment method"}
          </DialogTitle>
          <DialogDescription>
            Upload a QR code after saving, from the method's menu.
          </DialogDescription>
        </DialogHeader>
        <form
          id="payment-account"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(
              {
                id: account?.id,
                kind,
                label,
                accountName,
                accountNumber,
                instructions,
                currencies: currencies
                  .split(/[\s,]+/)
                  .map((c) => c.trim().toUpperCase())
                  .filter(Boolean),
                active,
              },
              {
                onSuccess: () => {
                  toast.success(account ? "Saved" : "Payment method added")
                  onOpenChange(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <Field label="Type" htmlFor="pa-kind">
            <Select
              items={PAYMENT_ACCOUNT_KIND_LABELS}
              value={kind}
              onValueChange={(v) => setKind(v as PaymentAccountKind)}
            >
              <SelectTrigger id="pa-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(
                    PAYMENT_ACCOUNT_KIND_LABELS
                  ) as PaymentAccountKind[]
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PAYMENT_ACCOUNT_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Name shown to clients"
            htmlFor="pa-label"
            hint="e.g. KBZPay, KBZ Bank, WavePay"
          >
            <Input
              id="pa-label"
              required
              maxLength={80}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Account name" htmlFor="pa-name" hint="Optional">
            <Input
              id="pa-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </Field>
          <Field
            label={kind === "mobile_wallet" ? "Phone number" : "Account number"}
            htmlFor="pa-number"
          >
            <Input
              id="pa-number"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </Field>
          <Field
            label="Instructions"
            htmlFor="pa-instructions"
            hint="Optional, e.g. put the invoice number in the note"
            className="sm:col-span-2"
          >
            <Textarea
              id="pa-instructions"
              rows={3}
              maxLength={1000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>
          <Field
            label="Currencies"
            htmlFor="pa-currencies"
            hint="Leave empty for any currency, or list codes like MMK, USD"
          >
            <Input
              id="pa-currencies"
              value={currencies}
              onChange={(e) => setCurrencies(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-2 self-end pb-2">
            <Checkbox
              id="pa-active"
              checked={active}
              onCheckedChange={(v) => setActive(Boolean(v))}
            />
            <Label htmlFor="pa-active" className="font-normal">
              Show to clients
            </Label>
          </div>
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
            form="payment-account"
            disabled={save.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
