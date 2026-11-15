"use client"

import type { ContractStatus } from "@workspace/contracts"
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
import { formatDate } from "@/lib/format"

import { useContracts } from "../api/queries"
import {
  CONTRACT_STATUS_LABELS,
  ContractStatusBadge,
} from "./contract-status-badge"

const TABS = ["all", "draft", "sent", "signed", "declined", "void"] as const

export function ContractsList({ clientId }: { clientId?: string }) {
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

  const contracts = useContracts({
    status: tab === "all" ? undefined : (tab as ContractStatus),
    clientId,
    q,
  })
  const rows = contracts.data?.pages.flatMap((p) => p.items) ?? []

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
                  {t === "all"
                    ? "All"
                    : t === "sent"
                      ? "Sent"
                      : CONTRACT_STATUS_LABELS[t]}
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
            render={<Link href={`/${slug}/contracts/templates`} />}
          >
            Templates
          </Button>
          <Can permission="contract.create">
            <Button
              nativeButton={false}
              render={<Link href={`/${slug}/contracts/new`} />}
            >
              New contract
            </Button>
          </Can>
        </div>
      </div>

      {contracts.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : contracts.error ? (
        <p className="text-sm text-destructive">{contracts.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">
            {q || tab !== "all" ? "No matching contracts" : "No contracts yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Write an agreement from a template, link it to a quote, and keep
            track of who signed and when.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead className="hidden sm:table-cell">Client</TableHead>
                <TableHead className="hidden md:table-cell">Starts</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${slug}/contracts/${c.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.number ?? "Draft"}
                      <span className="sm:hidden"> · {c.clientName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {c.clientName}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDate(c.effectiveDate, locale)}
                  </TableCell>
                  <TableCell>
                    <ContractStatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {contracts.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={contracts.isFetchingNextPage}
          onClick={() => void contracts.fetchNextPage()}
        >
          {contracts.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  )
}
