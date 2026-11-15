"use client"

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
import { useRouter } from "next/navigation"
import {
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs"
import * as React from "react"

import { Can } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"

import { useClients } from "../api/queries"
import { ClientFormDialog } from "./client-form-dialog"

const STATUSES = ["active", "archived"] as const

/** Client list with URL-synced search and status filter, keyset "load more". */
export function ClientsList() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""))
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES).withDefault("active")
  )
  const [search, setSearch] = React.useState(q)
  // ?new=true opens the create dialog (used by the command menu).
  const [creating, setCreatingParam] = useQueryState(
    "new",
    parseAsBoolean.withDefault(false)
  )
  const setCreating = (v: boolean) => void setCreatingParam(v || null)

  // Debounce typing into the URL (and therefore the query key).
  React.useEffect(() => {
    const t = setTimeout(() => void setQ(search || null), 250)
    return () => clearTimeout(t)
  }, [search, setQ])

  const clients = useClients({ q, status })
  const rows = clients.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={status}
            onValueChange={(v) =>
              void setStatus(v as (typeof STATUSES)[number])
            }
          >
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <Can permission="client.create">
          <Button onClick={() => setCreating(true)}>New client</Button>
        </Can>
      </div>

      {clients.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : clients.error ? (
        <p className="text-sm text-destructive">{clients.error.message}</p>
      ) : rows.length === 0 ? (
        <EmptyState
          filtered={Boolean(q) || status === "archived"}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden md:table-cell">Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/${slug}/clients/${c.id}`)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {c.name}
                      {c.type === "individual" ? (
                        <Badge variant="secondary">Individual</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {c.currency ?? "Default"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {clients.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={clients.isFetchingNextPage}
          onClick={() => void clients.fetchNextPage()}
        >
          {clients.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <ClientFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => router.push(`/${slug}/clients/${c.id}`)}
      />
    </div>
  )
}

function EmptyState({
  filtered,
  onCreate,
}: {
  filtered: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">
        {filtered ? "No matching clients" : "No clients yet"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Try a different search or filter."
          : "Add the people and companies you work with. Their details flow into quotes and invoices."}
      </p>
      {!filtered ? (
        <Can permission="client.create">
          <Button onClick={onCreate}>Add your first client</Button>
        </Can>
      ) : null}
    </div>
  )
}
