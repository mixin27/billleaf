"use client"

import type { Quote } from "@workspace/contracts"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { DocumentSheet, toParty } from "@/components/documents/document-sheet"
import { SendDialog } from "@/components/documents/send-dialog"
import { usePermissions } from "@/components/permissions/can"
import { useClient } from "@/features/clients"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { openPdf } from "@/lib/download"
import { formatDate } from "@/lib/format"

import {
  type QuoteAction,
  useConvertQuote,
  useDeleteQuote,
  useEmailQuote,
  useQuoteAction,
} from "../api/mutations"
import { useQuote } from "../api/queries"
import { QuoteStatusBadge } from "./quote-status-badge"

export function QuoteDetail({ quoteId }: { quoteId: string }) {
  const quote = useQuote(quoteId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (quote.isPending) return <Skeleton className="h-96 w-full" />
  if (quote.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{quote.error.message}</p>
        <Link href={`/${slug}/quotes`} className="text-sm underline">
          Back to quotes
        </Link>
      </div>
    )
  }
  return <QuoteDetailView quote={quote.data} />
}

const SUCCESS: Record<QuoteAction, string> = {
  send: "Quote marked as sent",
  accept: "Quote accepted",
  decline: "Quote declined",
  duplicate: "Duplicated as a new draft",
}

function QuoteDetailView({ quote }: { quote: Quote }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const client = useClient(quote.clientId)
  const { can } = usePermissions()
  const action = useQuoteAction(quote.id)
  const remove = useDeleteQuote(quote.id)
  const email = useEmailQuote(quote.id)
  const convert = useConvertQuote(quote.id)
  const [confirm, setConfirm] = React.useState<"send" | "delete" | null>(null)
  const [emailing, setEmailing] = React.useState(false)
  const locale = profile.data?.locale
  const draft = quote.status === "draft"
  const primaryEmail =
    client.data?.contacts.find((c) => c.isPrimary && c.email)?.email ??
    client.data?.email ??
    null

  const run = (a: QuoteAction) =>
    action.mutate(a, {
      onSuccess: (result) => {
        toast.success(SUCCESS[a])
        if (a === "duplicate" && result)
          router.push(`/${slug}/quotes/${result.id}/edit`)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/${slug}/quotes`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Quotes
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {quote.number ?? "Draft quote"}
            <QuoteStatusBadge quote={quote} />
          </h1>
          {quote.title ? (
            <p className="text-sm text-muted-foreground">{quote.title}</p>
          ) : null}
          {quote.invoiceId ? (
            <p className="mt-1 text-sm">
              Invoiced as{" "}
              <Link
                className="underline"
                href={`/${slug}/invoices/${quote.invoiceId}`}
              >
                {quote.invoiceNumber ?? "draft invoice"}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && can("quote.update") ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/${slug}/quotes/${quote.id}/edit`} />}
            >
              Edit
            </Button>
          ) : null}
          {draft && can("quote.send") ? (
            <Button
              onClick={() => setConfirm("send")}
              disabled={action.isPending}
            >
              Mark as sent
            </Button>
          ) : null}
          {!draft && can("quote.send") ? (
            <Button variant="outline" onClick={() => setEmailing(true)}>
              Email
            </Button>
          ) : null}
          {quote.status === "sent" && can("quote.update") ? (
            <>
              <Button
                variant="outline"
                onClick={() => run("decline")}
                disabled={action.isPending}
              >
                Declined
              </Button>
              <Button onClick={() => run("accept")} disabled={action.isPending}>
                Accepted
              </Button>
            </>
          ) : null}
          {quote.status === "accepted" &&
          !quote.invoiceId &&
          can("invoice.create") ? (
            <Button
              disabled={convert.isPending}
              onClick={() =>
                convert.mutate(undefined, {
                  onSuccess: (inv) => {
                    toast.success("Draft invoice created from quote")
                    router.push(`/${slug}/invoices/${inv.id}`)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Create invoice
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline">More</Button>}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  openPdf(`/v1/quotes/${quote.id}/pdf`).catch((e) =>
                    toast.error(errorMessage(e))
                  )
                }
              >
                Download PDF
              </DropdownMenuItem>
              {can("quote.create") ? (
                <DropdownMenuItem onClick={() => run("duplicate")}>
                  Duplicate
                </DropdownMenuItem>
              ) : null}
              {draft && can("quote.delete") ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirm("delete")}
                >
                  Delete draft
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DocumentSheet
        issuer={quote.issuerSnapshot ?? toParty(profile.data)}
        recipient={quote.clientSnapshot ?? toParty(client.data)}
        meta={[
          { label: "Quote", value: quote.number ?? "Draft" },
          { label: "Issued", value: formatDate(quote.issueDate, locale) },
          { label: "Valid until", value: formatDate(quote.validUntil, locale) },
          { label: "Currency", value: quote.currency },
        ]}
        lines={quote.lines}
        currency={quote.currency}
        locale={locale}
        subtotal={quote.subtotal}
        taxTotal={quote.taxTotal}
        total={quote.total}
        notes={quote.notes}
        terms={quote.terms}
        footer={profile.data?.documentFooter}
      />

      <SendDialog
        open={emailing}
        onOpenChange={setEmailing}
        title={`Email ${quote.number ?? "quote"}`}
        defaultTo={primaryEmail}
        pending={email.isPending}
        onSend={(input) =>
          email.mutate(input, {
            onSuccess: () => {
              toast.success("Quote emailed")
              setEmailing(false)
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "send"
                ? "Mark this quote as sent?"
                : "Delete this draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "send"
                ? "It gets the next quote number and becomes read-only. Client and business details are frozen as they are now. You can then email the PDF."
                : "This draft will be permanently removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={() => {
                if (confirm === "send") run("send")
                else
                  remove.mutate(undefined, {
                    onSuccess: () => {
                      toast.success("Draft deleted")
                      router.push(`/${slug}/quotes`)
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                setConfirm(null)
              }}
            >
              {confirm === "send" ? "Mark as sent" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
