"use client"

import type { InvoiceDisplayStatus } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useInvoices } from "../api/queries"
import {
  INVOICE_STATUS_LABELS,
  InvoiceStatusBadge,
} from "./invoice-status-badge"

const TABS = [
  "all",
  "draft",
  "open",
  "overdue",
  "partially_paid",
  "paid",
  "void",
] as const

export function InvoicesList() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const [tab, setTab] = useQueryState(
    "status",
    parseAsStringLiteral(TABS).withDefault("all")
  )
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""))
  const [search, setSearch] = React.useState(q)

  React.useEffect(() => {
    const t = setTimeout(() => void setQ(search || null), 250)
    return () => clearTimeout(t)
  }, [search, setQ])

  const invoices = useInvoices({
    status: tab === "all" ? undefined : (tab as InvoiceDisplayStatus),
    q,
  })
  const rows = invoices.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => void setTab(v as (typeof TABS)[number])}
          >
            <TabsList className="max-w-full overflow-x-auto">
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t === "all" ? "All" : INVOICE_STATUS_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search number, title, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/${slug}/invoices/recurring`} />}
          >
            Recurring
          </Button>
          <Can permission="invoice.create">
            <Button
              nativeButton={false}
              render={<Link href={`/${slug}/invoices/new`} />}
            >
              New invoice
            </Button>
          </Can>
        </div>
      </div>

      {invoices.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : invoices.error ? (
        <p className="text-sm text-destructive">{invoices.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">
            {q || tab !== "all" ? "No matching invoices" : "No invoices yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create one from scratch, or convert an accepted quote.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Due amount
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((inv) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${slug}/invoices/${inv.id}`)}
                >
                  <TableCell className="font-medium">
                    {inv.number ?? (
                      <span className="text-muted-foreground">Draft</span>
                    )}
                  </TableCell>
                  <TableCell>{inv.clientName}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(inv.dueDate, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(inv.total, inv.currency, locale)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {inv.status === "issued"
                      ? money(inv.amountDue, inv.currency, locale)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.displayStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {invoices.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={invoices.isFetchingNextPage}
          onClick={() => void invoices.fetchNextPage()}
        >
          {invoices.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
