"use client"

import { PAYMENT_STATUS_LABELS } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Download01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import * as React from "react"

import { DocumentSheet } from "@/components/documents/document-sheet"
import { ContractStatusBadge, ContractText } from "@/features/contracts"
import { InvoiceStatusBadge } from "@/features/invoices"
import { formatDate, money } from "@/lib/format"

import {
  portalPdfUrl,
  usePortalContract,
  usePortalInvoice,
  usePortalQuote,
} from "../api/queries"
import { PortalQuoteBadge } from "./portal-pages"
import { HowToPay, PaymentProofForm } from "./portal-pay"
import { ContractSigning, QuoteResponse } from "./portal-respond"

function DocHeader({
  title,
  badge,
  pdf,
  sub,
}: {
  title: string
  badge: React.ReactNode
  pdf: string
  sub?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {badge}
        </div>
        {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      <Button
        variant="outline"
        nativeButton={false}
        render={<a href={pdf} target="_blank" rel="noreferrer" />}
      >
        <HugeiconsIcon icon={Download01Icon} strokeWidth={1.8} />
        Download PDF
      </Button>
    </div>
  )
}

function Missing({ error }: { error: Error | null }) {
  return error ? (
    <p className="text-sm text-muted-foreground">
      This document isn’t available. It may have been withdrawn.
    </p>
  ) : (
    <Skeleton className="h-96 w-full" />
  )
}

export function PortalQuoteView({ slug, id }: { slug: string; id: string }) {
  const q = usePortalQuote(slug, id)
  if (!q.data) return <Missing error={q.error} />
  const d = q.data
  return (
    <>
      <DocHeader
        title={`Quote ${d.number}`}
        badge={<PortalQuoteBadge status={d.status} />}
        pdf={portalPdfUrl(slug, "quotes", id)}
        sub={
          d.acceptedAt
            ? `Accepted ${formatDate(d.acceptedAt.slice(0, 10))}${d.respondedByName ? ` by ${d.respondedByName}` : ""}`
            : d.declinedAt
              ? `Declined ${formatDate(d.declinedAt.slice(0, 10))}${d.declineReason ? ` · “${d.declineReason}”` : ""}`
              : d.title
        }
      />
      {d.status === "sent" ? (
        <div className="mb-4">
          <QuoteResponse
            slug={slug}
            id={id}
            businessName={d.issuer?.name ?? "The business"}
          />
        </div>
      ) : d.status === "expired" ? (
        <p className="mb-4 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          This quote has expired. Ask {d.issuer?.name ?? "the sender"} for an
          updated one.
        </p>
      ) : null}
      <DocumentSheet
        issuer={d.issuer}
        recipient={d.client}
        meta={[
          { label: "Quote", value: d.number },
          { label: "Issued", value: formatDate(d.issueDate) },
          {
            label: "Valid until",
            value: d.validUntil ? formatDate(d.validUntil) : "—",
          },
          { label: "Total", value: money(d.total, d.currency) },
        ]}
        lines={d.lines}
        currency={d.currency}
        subtotal={d.subtotal}
        taxTotal={d.taxTotal}
        total={d.total}
        notes={d.notes}
        terms={d.terms}
      />
    </>
  )
}

export function PortalInvoiceView({ slug, id }: { slug: string; id: string }) {
  const q = usePortalInvoice(slug, id)
  if (!q.data) return <Missing error={q.error} />
  const d = q.data
  return (
    <div className="flex flex-col gap-6">
      <div>
        <DocHeader
          title={`Invoice ${d.number}`}
          badge={<InvoiceStatusBadge status={d.status} />}
          pdf={portalPdfUrl(slug, "invoices", id)}
          sub={
            d.amountDue > 0
              ? `${money(d.amountDue, d.currency)} due${d.dueDate ? ` by ${formatDate(d.dueDate)}` : ""}`
              : d.title
          }
        />
        <DocumentSheet
          issuer={d.issuer}
          recipient={d.client}
          recipientLabel="Bill to"
          meta={[
            { label: "Invoice", value: d.number },
            { label: "Issued", value: formatDate(d.issueDate) },
            { label: "Due", value: d.dueDate ? formatDate(d.dueDate) : "—" },
            { label: "Amount due", value: money(d.amountDue, d.currency) },
          ]}
          lines={d.lines}
          currency={d.currency}
          subtotal={d.subtotal}
          taxTotal={d.taxTotal}
          total={d.total}
          extraTotals={
            d.amountPaid > 0 || d.amountCredited > 0
              ? [
                  ...(d.amountPaid > 0
                    ? [{ label: "Paid", amount: -d.amountPaid }]
                    : []),
                  ...(d.amountCredited > 0
                    ? [{ label: "Credited", amount: -d.amountCredited }]
                    : []),
                  { label: "Amount due", amount: d.amountDue, strong: true },
                ]
              : []
          }
          notes={d.notes}
          terms={d.terms}
        />
      </div>
      {d.amountDue > 0 ? (
        <>
          <HowToPay accounts={d.paymentAccounts} />
          <PaymentProofForm slug={slug} invoice={d} />
        </>
      ) : null}
      {d.receipts.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Payments</h2>
          <Card className="py-0">
            <ul className="divide-y">
              {d.receipts.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                >
                  <span className="flex-1">
                    {formatDate(r.paidOn)} · {r.receiptNumber}
                    {r.status !== "completed"
                      ? ` · ${PAYMENT_STATUS_LABELS[r.status]}`
                      : ""}
                  </span>
                  <span className="font-medium tabular-nums">
                    {money(r.amount, r.currency)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={portalPdfUrl(slug, "receipts", r.id)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    Receipt
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  )
}

export function PortalContractView({ slug, id }: { slug: string; id: string }) {
  const q = usePortalContract(slug, id)
  if (!q.data) return <Missing error={q.error} />
  const d = q.data
  return (
    <>
      <DocHeader
        title={d.title}
        badge={<ContractStatusBadge status={d.status} />}
        pdf={portalPdfUrl(slug, "contracts", id)}
        sub={
          <>
            {d.number}
            {d.signedAt
              ? ` · signed ${formatDate(d.signedAt)}${d.signedByName ? ` by ${d.signedByName}` : ""}${d.signedVia === "portal" ? " (electronically)" : ""}`
              : d.effectiveDate
                ? ` · starts ${formatDate(d.effectiveDate)}`
                : ""}
          </>
        }
      />
      <Card>
        <CardContent className="p-6 sm:p-10">
          <ContractText text={d.body} />
        </CardContent>
      </Card>
      {d.status === "sent" ? (
        <div className="mt-4">
          <ContractSigning slug={slug} id={id} />
        </div>
      ) : null}
      <p className="mt-4 text-sm">
        <Link
          className="underline"
          href={`/portal/${encodeURIComponent(slug)}/contracts`}
        >
          All contracts
        </Link>
      </p>
    </>
  )
}
