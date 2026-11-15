"use client"

import type { Client } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { useRouter } from "next/navigation"
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { Can } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"

import { useClients } from "../api/queries"
import { ClientFormDialog } from "./client-form-dialog"

const STATUSES = ["active", "archived"] as const
const col = columnsFor<Client>()

const columns = [
  col.accessor("name", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    enableSorting: true,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        {row.original.name}
        {row.original.type === "individual" ? (
          <Badge variant="secondary">Individual</Badge>
        ) : null}
      </span>
    ),
  }),
  col.accessor("email", {
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    enableSorting: true,
    meta: {
      label: "Email",
      hideBelow: "sm",
      className: "text-muted-foreground",
    },
    cell: ({ getValue }) => getValue() ?? "—",
  }),
  col.display({
    id: "location",
    header: "Location",
    meta: {
      label: "Location",
      hideBelow: "md",
      className: "text-muted-foreground",
    },
    cell: ({ row }) =>
      [row.original.city, row.original.country].filter(Boolean).join(", ") ||
      "—",
  }),
  col.accessor("currency", {
    header: "Currency",
    meta: {
      label: "Currency",
      hideBelow: "md",
      className: "text-muted-foreground",
    },
    cell: ({ getValue }) => getValue() ?? "Default",
  }),
]

/** Clients: search, active/archived, sortable server-paged table. */
export function ClientsList() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const table = useDataTableState({ sort: "name:asc" })
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES).withDefault("active")
  )
  // ?new=true opens the create dialog (used by the command menu).
  const [creating, setCreatingParam] = useQueryState(
    "new",
    parseAsBoolean.withDefault(false)
  )
  const setCreating = (v: boolean) => void setCreatingParam(v || null)
  const clients = useClients({ ...table.query, status })

  return (
    <>
      <DataTable
        id="clients"
        columns={columns}
        data={clients.data?.items}
        total={clients.data?.total}
        state={table}
        isLoading={clients.isPending}
        error={clients.error}
        filtered={status === "archived"}
        getRowHref={(c) => `/${slug}/clients/${c.id}`}
        toolbar={(t) => (
          <DataTableToolbar
            table={t}
            state={table}
            searchPlaceholder="Search name or email…"
            filters={
              <Tabs
                value={status}
                onValueChange={(v) => {
                  void setStatus(v === "active" ? null : (v as "archived"))
                  table.resetPage()
                }}
              >
                <TabsList>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="archived">Archived</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            actions={
              <Can permission="client.create">
                <Button onClick={() => setCreating(true)}>New client</Button>
              </Can>
            }
          />
        )}
        empty={(filtered) =>
          filtered ? (
            <DataTableEmpty
              title="No matching clients"
              description="Try a different search or filter."
            />
          ) : (
            <DataTableEmpty
              title="No clients yet"
              description="Add the people and companies you work with. Their details flow into quotes and invoices."
              action={
                <Can permission="client.create">
                  <Button onClick={() => setCreating(true)}>
                    Add your first client
                  </Button>
                </Can>
              }
            />
          )
        }
      />
      <ClientFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(c) => router.push(`/${slug}/clients/${c.id}`)}
      />
    </>
  )
}
