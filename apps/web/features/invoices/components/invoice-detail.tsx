"use client"

import type { Invoice } from "@workspace/contracts"
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
import { Button } from "@workspace/ui/components/button"
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
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { DocumentSheet, toParty } from "@/components/documents/document-sheet"
import { SendDialog } from "@/components/documents/send-dialog"
import { usePermissions } from "@/components/permissions/can"
import { useClient } from "@/features/clients"
import { InvoicePayments, RecordPaymentDialog } from "@/features/payments"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { openPdf } from "@/lib/download"
import { formatDate } from "@/lib/format"

import {
  type InvoiceAction,
  useDeleteInvoice,
  useInvoiceAction,
  useSendInvoice,
  useVoidInvoice,
} from "../api/mutations"
import { useInvoice } from "../api/queries"
import { InvoiceStatusBadge } from "./invoice-status-badge"

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const invoice = useInvoice(invoiceId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (invoice.isPending) return <Skeleton className="h-96 w-full" />
  if (invoice.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{invoice.error.message}</p>
        <Link href={`/${slug}/invoices`} className="text-sm underline">
          Back to invoices
        </Link>
      </div>
    )
  }
  return <InvoiceDetailView invoice={invoice.data} />
}

function InvoiceDetailView({ invoice }: { invoice: Invoice }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const client = useClient(invoice.clientId)
  const { can } = usePermissions()
  const action = useInvoiceAction(invoice.id)
  const send = useSendInvoice(invoice.id)
  const voidInvoice = useVoidInvoice(invoice.id)
  const remove = useDeleteInvoice(invoice.id)
  const [dialog, setDialog] = React.useState<
    "issue" | "delete" | "void" | "send" | "pay" | null
  >(null)
  const [voidReason, setVoidReason] = React.useState("")
  const locale = profile.data?.locale
  const draft = invoice.status === "draft"
  const issued = invoice.status === "issued"
  const primaryEmail =
    client.data?.contacts.find((c) => c.isPrimary && c.email)?.email ??
    client.data?.email ??
    null

  const run = (a: InvoiceAction) =>
    action.mutate(a, {
      onSuccess: (result) => {
        toast.success(
          a === "issue"
            ? `Issued as ${result?.number}`
            : "Duplicated as a new draft"
        )
        if (a === "duplicate" && result)
          router.push(`/${slug}/invoices/${result.id}/edit`)
        if (a === "issue") setDialog("send")
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/${slug}/invoices`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Invoices
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {invoice.number ?? "Draft invoice"}
            <InvoiceStatusBadge status={invoice.displayStatus} />
          </h1>
          {invoice.title ? (
            <p className="text-sm text-muted-foreground">{invoice.title}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {invoice.quoteId ? (
              <>
                From quote{" "}
                <Link
                  className="underline"
                  href={`/${slug}/quotes/${invoice.quoteId}`}
                >
                  {invoice.quoteNumber}
                </Link>
                {" · "}
              </>
            ) : null}
            {invoice.lastSentAt
              ? `Last emailed to ${invoice.lastSentTo} on ${formatDate(invoice.lastSentAt, locale)}`
              : issued
                ? "Not emailed yet"
                : null}
            {invoice.status === "void" && invoice.voidReason
              ? `Voided: ${invoice.voidReason}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && can("invoice.update") ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${slug}/invoices/${invoice.id}/edit`} />}
            >
              Edit
            </Button>
          ) : null}
          {draft && can("invoice.send") ? (
            <Button
              onClick={() => setDialog("issue")}
              disabled={action.isPending}
            >
              Issue invoice
            </Button>
          ) : null}
          {issued && invoice.amountDue > 0 && can("payment.record") ? (
            <Button variant="outline" onClick={() => setDialog("pay")}>
              Record payment
            </Button>
          ) : null}
          {issued && can("invoice.send") ? (
            <Button onClick={() => setDialog("send")}>
              {invoice.lastSentAt ? "Send again" : "Send"}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline">More</Button>}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  openPdf(`/v1/invoices/${invoice.id}/pdf`).catch((e) =>
                    toast.error(errorMessage(e))
                  )
                }
              >
                Download PDF
              </DropdownMenuItem>
              {can("invoice.create") ? (
                <DropdownMenuItem onClick={() => run("duplicate")}>
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {issued && invoice.amountPaid === 0 && can("invoice.void") ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDialog("void")}
                >
                  Void invoice
                </DropdownMenuItem>
              ) : null}
              {draft && can("invoice.update") ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDialog("delete")}
                >
                  Delete draft
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DocumentSheet
        issuer={invoice.issuerSnapshot ?? toParty(profile.data)}
        recipient={invoice.clientSnapshot ?? toParty(client.data)}
        recipientLabel="Bill to"
        meta={[
          { label: "Invoice", value: invoice.number ?? "Draft" },
          { label: "Issued", value: formatDate(invoice.issueDate, locale) },
          {
            label: "Due",
            value: invoice.dueDate
              ? formatDate(invoice.dueDate, locale)
              : "On issue",
          },
          { label: "Currency", value: invoice.currency },
        ]}
        lines={invoice.lines}
        currency={invoice.currency}
        locale={locale}
        subtotal={invoice.subtotal}
        taxTotal={invoice.taxTotal}
        total={invoice.total}
        extraTotals={
          invoice.status === "issued"
            ? [
                ...(invoice.amountPaid > 0
                  ? [{ label: "Paid", amount: invoice.amountPaid }]
                  : []),
                {
                  label: "Amount due",
                  amount: invoice.amountDue,
                  strong: true,
                },
              ]
            : []
        }
        notes={invoice.notes}
        terms={invoice.terms}
        footer={profile.data?.documentFooter}
      />

      {invoice.status !== "draft" ? (
        <InvoicePayments
          invoiceId={invoice.id}
          locale={locale}
          defaultEmail={primaryEmail}
        />
      ) : null}

      <RecordPaymentDialog
        open={dialog === "pay"}
        onOpenChange={(o) => setDialog(o ? "pay" : null)}
        invoice={invoice}
        locale={locale}
      />

      <SendDialog
        open={dialog === "send"}
        onOpenChange={(o) => setDialog(o ? "send" : null)}
        title={`Email ${invoice.number ?? "invoice"}`}
        defaultTo={primaryEmail}
        pending={send.isPending}
        onSend={(input) =>
          send.mutate(input, {
            onSuccess: (r) => {
              toast.success(`Invoice emailed to ${r.lastSentTo}`)
              setDialog(null)
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />

      <Dialog
        open={dialog === "void"}
        onOpenChange={(o) => setDialog(o ? "void" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {invoice.number}?</DialogTitle>
            <DialogDescription>
              The invoice stays in your records marked void and its number is
              not reused. Duplicate it to issue a corrected one.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason, e.g. issued to the wrong client"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidReason.trim().length < 3 || voidInvoice.isPending}
              onClick={() =>
                voidInvoice.mutate(voidReason.trim(), {
                  onSuccess: () => {
                    toast.success("Invoice voided")
                    setDialog(null)
                    setVoidReason("")
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Void invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dialog === "issue" || dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "issue"
                ? "Issue this invoice?"
                : "Delete this draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "issue"
                ? "It gets the next invoice number and becomes read-only. Client and business details are frozen. Mistakes are fixed by voiding and issuing a new invoice."
                : "This draft will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={dialog === "delete" ? "destructive" : "default"}
              onClick={() => {
                if (dialog === "issue") run("issue")
                else
                  remove.mutate(undefined, {
                    onSuccess: () => {
                      toast.success("Draft deleted")
                      router.push(`/${slug}/invoices`)
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                setDialog(null)
              }}
            >
              {dialog === "issue" ? "Issue" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
