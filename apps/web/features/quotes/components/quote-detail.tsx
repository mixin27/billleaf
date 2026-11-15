"use client"

import type { PartySnapshot, Quote } from "@workspace/contracts"
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
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useClient } from "@/features/clients"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  type QuoteAction,
  useDeleteQuote,
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
  const [confirm, setConfirm] = React.useState<"send" | "delete" | null>(null)
  const locale = profile.data?.locale
  const draft = quote.status === "draft"

  const run = (a: QuoteAction) =>
    action.mutate(a, {
      onSuccess: (result) => {
        toast.success(SUCCESS[a])
        if (a === "duplicate" && result)
          router.push(`/${slug}/quotes/${result.id}/edit`)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  // Drafts show live data; issued quotes show the frozen snapshots.
  const issuer: PartySnapshot | null =
    quote.issuerSnapshot ??
    (profile.data
      ? {
          name: profile.data.name,
          legalName: profile.data.legalName,
          email: profile.data.email,
          phone: profile.data.phone,
          taxId: profile.data.taxId,
          addressLines: addressLines(profile.data),
        }
      : null)
  const recipient: PartySnapshot | null =
    quote.clientSnapshot ??
    (client.data
      ? {
          name: client.data.name,
          email: client.data.email,
          phone: client.data.phone,
          taxId: client.data.taxId,
          addressLines: addressLines(client.data),
        }
      : null)

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
          {can("quote.create") || (draft && can("quote.delete")) ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline">More</Button>}
              />
              <DropdownMenuContent align="end">
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
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-8 p-6 sm:p-10">
          <div className="grid gap-6 sm:grid-cols-2">
            <Party label="From" party={issuer} />
            <Party label="For" party={recipient} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Meta label="Quote" value={quote.number ?? "Draft"} />
            <Meta label="Issued" value={formatDate(quote.issueDate, locale)} />
            <Meta
              label="Valid until"
              value={formatDate(quote.validUntil, locale)}
            />
            <Meta label="Currency" value={quote.currency} />
          </dl>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Tax
                </TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No line items yet.
                  </TableCell>
                </TableRow>
              ) : (
                quote.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-pre-line">
                      {l.description}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.unitPrice, quote.currency, locale)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {l.taxRateBps ? `${l.taxRateBps / 100}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.amount, quote.currency, locale)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right tabular-nums">
              {money(quote.subtotal, quote.currency, locale)}
            </dd>
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-right tabular-nums">
              {money(quote.taxTotal, quote.currency, locale)}
            </dd>
            <dt className="font-medium">Total</dt>
            <dd className="text-right font-medium tabular-nums">
              {money(quote.total, quote.currency, locale)}
            </dd>
          </dl>

          {quote.notes || quote.terms ? (
            <div className="grid gap-6 text-sm sm:grid-cols-2">
              {quote.notes ? (
                <TextBlock label="Notes" text={quote.notes} />
              ) : null}
              {quote.terms ? (
                <TextBlock label="Terms" text={quote.terms} />
              ) : null}
            </div>
          ) : null}
          {profile.data?.documentFooter ? (
            <p className="border-t pt-4 text-xs whitespace-pre-line text-muted-foreground">
              {profile.data.documentFooter}
            </p>
          ) : null}
        </CardContent>
      </Card>

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
                ? "It gets the next quote number and becomes read-only. Client and business details are frozen as they are now. To change it later, duplicate it."
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

function addressLines(a: {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}) {
  return [
    a.addressLine1,
    a.addressLine2,
    [a.city, a.state, a.postalCode].filter(Boolean).join(" ") || null,
    a.country,
  ].filter((l): l is string => Boolean(l))
}

function Party({
  label,
  party,
}: {
  label: string
  party: PartySnapshot | null
}) {
  return (
    <div className="text-sm">
      <p className="mb-1 text-xs text-muted-foreground uppercase">{label}</p>
      {party ? (
        <>
          <p className="font-medium">{party.legalName || party.name}</p>
          {party.addressLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {party.email ? <p>{party.email}</p> : null}
          {party.phone ? <p>{party.phone}</p> : null}
          {party.taxId ? (
            <p className="text-muted-foreground">Tax ID {party.taxId}</p>
          ) : null}
        </>
      ) : (
        <Skeleton className="h-16 w-40" />
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground uppercase">{label}</p>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  )
}
