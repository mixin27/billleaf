"use client"

import { PAYMENT_METHOD_LABELS, type PaymentStatus } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
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
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"

import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { usePayments } from "../api/queries"
import { PaymentActions } from "./payment-actions"

const TABS = ["all", "completed", "refunded"] as const

export function PaymentsList() {
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

  const payments = usePayments({
    status: tab === "all" ? undefined : (tab as PaymentStatus),
    q,
  })
  const rows = payments.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => void setTab(v as (typeof TABS)[number])}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Received</TabsTrigger>
            <TabsTrigger value="refunded">Refunded</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          placeholder="Search receipt, invoice, client, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
      </div>

      {payments.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : payments.error ? (
        <p className="text-sm text-destructive">{payments.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {q || tab !== "all"
            ? "No matching payments."
            : "No payments yet. Record them from an issued invoice."}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Invoice</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(p.paidOn, locale)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.receiptNumber}
                    {p.status === "refunded" ? (
                      <Badge variant="outline" className="ml-2">
                        Refunded
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Link
                      className="underline"
                      href={`/${slug}/invoices/${p.invoiceId}`}
                    >
                      {p.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {PAYMENT_METHOD_LABELS[p.method]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(p.amount, p.currency, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PaymentActions payment={p} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {payments.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={payments.isFetchingNextPage}
          onClick={() => void payments.fetchNextPage()}
        >
          {payments.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
