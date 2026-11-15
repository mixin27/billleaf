"use client"

import type { QuoteStatus } from "@workspace/contracts"
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

import { useQuotes } from "../api/queries"
import { QuoteStatusBadge } from "./quote-status-badge"

const TABS = ["all", "draft", "sent", "accepted", "declined"] as const

export function QuotesList() {
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

  const quotes = useQuotes({
    status: tab === "all" ? undefined : (tab as QuoteStatus),
    q,
  })
  const rows = quotes.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => void setTab(v as (typeof TABS)[number])}
          >
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t} className="capitalize">
                  {t}
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
        <Can permission="quote.create">
          <Button
            nativeButton={false}
            render={<Link href={`/${slug}/quotes/new`} />}
          >
            New quote
          </Button>
        </Can>
      </div>

      {quotes.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : quotes.error ? (
        <p className="text-sm text-destructive">{quotes.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">
            {q || tab !== "all" ? "No matching quotes" : "No quotes yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Quotes turn into contracts, projects and invoices once your client
            accepts.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Title</TableHead>
                <TableHead className="hidden md:table-cell">Issued</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((quote) => (
                <TableRow
                  key={quote.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${slug}/quotes/${quote.id}`)}
                >
                  <TableCell className="font-medium">
                    {quote.number ?? (
                      <span className="text-muted-foreground">Draft</span>
                    )}
                  </TableCell>
                  <TableCell>{quote.clientName}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {quote.title ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(quote.issueDate, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(quote.total, quote.currency, locale)}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge quote={quote} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {quotes.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={quotes.isFetchingNextPage}
          onClick={() => void quotes.fetchNextPage()}
        >
          {quotes.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
