"use client"

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type PortalContractSummary,
  type PortalInvoiceSummary,
  type PortalQuoteSummary,
} from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import * as React from "react"

import { ContractStatusBadge } from "@/features/contracts"
import { InvoiceStatusBadge } from "@/features/invoices"
import { QuoteStatusBadge } from "@/features/quotes"
import { formatDate, money } from "@/lib/format"

import {
  portalPdfUrl,
  usePortalContracts,
  usePortalInvoices,
  usePortalMe,
  usePortalQuotes,
  usePortalReceipts,
} from "../api/queries"

const href = (slug: string, p: string) =>
  `/portal/${encodeURIComponent(slug)}${p}`

export function PortalQuoteBadge({
  status,
}: {
  status: PortalQuoteSummary["status"]
}) {
  return (
    <QuoteStatusBadge
      quote={{
        status: status === "expired" ? "sent" : status,
        isExpired: status === "expired",
      }}
    />
  )
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h1>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** A list row that opens a document. */
function Row({
  to,
  title,
  sub,
  badge,
  amount,
}: {
  to: string
  title: string
  sub: string
  badge: React.ReactNode
  amount: string
}) {
  return (
    <li>
      <Link
        href={to}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
        {badge}
        <span className="w-28 text-right font-medium tabular-nums">
          {amount}
        </span>
      </Link>
    </li>
  )
}

function ListCard({
  loading,
  empty,
  children,
}: {
  loading: boolean
  empty: string | null
  children: React.ReactNode
}) {
  if (loading) return <Skeleton className="h-40 w-full" />
  if (empty) return <Empty>{empty}</Empty>
  return (
    <Card className="py-0">
      <ul className="divide-y">{children}</ul>
    </Card>
  )
}

function InvoiceRows({
  slug,
  items,
  locale,
}: {
  slug: string
  items: PortalInvoiceSummary[]
  locale?: string
}) {
  return items.map((i) => (
    <Row
      key={i.id}
      to={href(slug, `/invoices/${i.id}`)}
      title={`${i.number}${i.title ? ` · ${i.title}` : ""}`}
      sub={
        i.dueDate
          ? `Due ${formatDate(i.dueDate, locale)}`
          : `Issued ${formatDate(i.issueDate, locale)}`
      }
      badge={<InvoiceStatusBadge status={i.status} />}
      amount={money(
        i.amountDue > 0 ? i.amountDue : i.total,
        i.currency,
        locale
      )}
    />
  ))
}

function QuoteRows({
  slug,
  items,
  locale,
}: {
  slug: string
  items: PortalQuoteSummary[]
  locale?: string
}) {
  return items.map((q) => (
    <Row
      key={q.id}
      to={href(slug, `/quotes/${q.id}`)}
      title={`${q.number}${q.title ? ` · ${q.title}` : ""}`}
      sub={
        q.validUntil
          ? `Valid until ${formatDate(q.validUntil, locale)}`
          : `Issued ${formatDate(q.issueDate, locale)}`
      }
      badge={<PortalQuoteBadge status={q.status} />}
      amount={money(q.total, q.currency, locale)}
    />
  ))
}

function ContractRows({
  slug,
  items,
  locale,
}: {
  slug: string
  items: PortalContractSummary[]
  locale?: string
}) {
  return items.map((c) => (
    <Row
      key={c.id}
      to={href(slug, `/contracts/${c.id}`)}
      title={`${c.number} · ${c.title}`}
      sub={
        c.signedAt
          ? `Signed ${formatDate(c.signedAt, locale)}`
          : c.effectiveDate
            ? `Starts ${formatDate(c.effectiveDate, locale)}`
            : "Contract"
      }
      badge={<ContractStatusBadge status={c.status} />}
      amount=""
    />
  ))
}

export function PortalOverview({ slug }: { slug: string }) {
  const me = usePortalMe(slug)
  const invoices = usePortalInvoices(slug)
  const quotes = usePortalQuotes(slug)
  const contracts = usePortalContracts(slug)
  const s = me.data?.summary
  const open = (invoices.data ?? []).filter((i) =>
    ["open", "overdue", "partially_paid"].includes(i.status)
  )
  const waitingQuotes = (quotes.data ?? []).filter((q) => q.status === "sent")
  const waitingContracts = (contracts.data ?? []).filter(
    (c) => c.status === "sent"
  )
  const nothing =
    !invoices.isPending &&
    !quotes.isPending &&
    !contracts.isPending &&
    open.length + waitingQuotes.length + waitingContracts.length === 0

  return (
    <div className="flex flex-col gap-6">
      <Heading
        title={`Hello${me.data ? `, ${me.data.client.name}` : ""}`}
        hint={`Signed in as ${me.data?.email ?? ""}`}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Amount due"
          value={
            s?.amountDue.length
              ? s.amountDue.map((a) => money(a.amount, a.currency)).join(" · ")
              : "—"
          }
          hint={
            s?.overdueInvoices
              ? `${s.overdueInvoices} overdue`
              : `${s?.openInvoices ?? 0} open ${s?.openInvoices === 1 ? "invoice" : "invoices"}`
          }
          to={href(slug, "/invoices")}
        />
        <SummaryTile
          label="Quotes to review"
          value={String(s?.quotesAwaitingReply ?? 0)}
          to={href(slug, "/quotes")}
        />
        <SummaryTile
          label="Contracts to sign"
          value={String(s?.contractsAwaitingSignature ?? 0)}
          to={href(slug, "/contracts")}
        />
      </div>

      {nothing ? (
        <Empty>You’re all caught up. Nothing needs your attention.</Empty>
      ) : null}
      {open.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Open invoices</h2>
          <ListCard loading={false} empty={null}>
            <InvoiceRows slug={slug} items={open} />
          </ListCard>
        </section>
      ) : null}
      {waitingQuotes.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">
            Quotes awaiting your reply
          </h2>
          <ListCard loading={false} empty={null}>
            <QuoteRows slug={slug} items={waitingQuotes} />
          </ListCard>
        </section>
      ) : null}
      {waitingContracts.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Contracts to sign</h2>
          <ListCard loading={false} empty={null}>
            <ContractRows slug={slug} items={waitingContracts} />
          </ListCard>
        </section>
      ) : null}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  hint,
  to,
}: {
  label: string
  value: string
  hint?: string
  to: string
}) {
  return (
    <Link
      href={to}
      className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {label}
          </p>
          <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

export function PortalInvoicesPage({ slug }: { slug: string }) {
  const q = usePortalInvoices(slug)
  return (
    <>
      <Heading title="Invoices" />
      <ListCard
        loading={q.isPending}
        empty={q.data?.length === 0 ? "No invoices yet." : null}
      >
        <InvoiceRows slug={slug} items={q.data ?? []} />
      </ListCard>
    </>
  )
}

export function PortalQuotesPage({ slug }: { slug: string }) {
  const q = usePortalQuotes(slug)
  return (
    <>
      <Heading title="Quotes" />
      <ListCard
        loading={q.isPending}
        empty={q.data?.length === 0 ? "No quotes yet." : null}
      >
        <QuoteRows slug={slug} items={q.data ?? []} />
      </ListCard>
    </>
  )
}

export function PortalContractsPage({ slug }: { slug: string }) {
  const q = usePortalContracts(slug)
  return (
    <>
      <Heading title="Contracts" />
      <ListCard
        loading={q.isPending}
        empty={q.data?.length === 0 ? "No contracts yet." : null}
      >
        <ContractRows slug={slug} items={q.data ?? []} />
      </ListCard>
    </>
  )
}

export function PortalReceiptsPage({ slug }: { slug: string }) {
  const q = usePortalReceipts(slug)
  return (
    <>
      <Heading
        title="Receipts"
        hint="Payments you’ve made and their receipts."
      />
      <ListCard
        loading={q.isPending}
        empty={q.data?.length === 0 ? "No payments yet." : null}
      >
        {(q.data ?? []).map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {r.receiptNumber}
                {r.status !== "completed" ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABELS[r.status]}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(r.paidOn)} · {PAYMENT_METHOD_LABELS[r.method]}
                {r.invoiceNumber ? (
                  <>
                    {" · for "}
                    <Link
                      className="underline"
                      href={href(slug, `/invoices/${r.invoiceId}`)}
                    >
                      {r.invoiceNumber}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
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
              PDF
            </Button>
          </li>
        ))}
      </ListCard>
    </>
  )
}
