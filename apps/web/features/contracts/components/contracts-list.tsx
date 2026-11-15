"use client"

import type { ContractStatus, ContractSummary } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableSelectFilter,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate } from "@/lib/format"

import { useContracts } from "../api/queries"
import {
  CONTRACT_STATUS_LABELS,
  ContractStatusBadge,
} from "./contract-status-badge"

const STATUSES = [
  "draft",
  "sent",
  "signed",
  "declined",
  "void",
] as const satisfies readonly ContractStatus[]
const col = columnsFor<ContractSummary>()

function useColumns(locale: string | undefined) {
  return [
    col.accessor("title", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Contract" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.title}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.number ?? "Draft"}
            <span className="sm:hidden"> · {row.original.clientName}</span>
          </div>
        </div>
      ),
    }),
    col.accessor("clientName", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client" />
      ),
      enableSorting: true,
      meta: { label: "Client", hideBelow: "sm" },
    }),
    col.accessor("effectiveDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Starts" />
      ),
      enableSorting: true,
      meta: {
        label: "Starts",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("signedAt", {
      header: "Signed",
      meta: {
        label: "Signed",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("status", {
      header: "Status",
      enableHiding: false,
      cell: ({ getValue }) => <ContractStatusBadge status={getValue()} />,
    }),
  ]
}

export function ContractsList({ clientId }: { clientId?: string }) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState()
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES)
  )
  const contracts = useContracts({
    ...table.query,
    status: status ?? undefined,
    clientId,
  })

  return (
    <DataTable
      id="contracts"
      columns={useColumns(locale)}
      data={contracts.data?.items}
      total={contracts.data?.total}
      state={table}
      isLoading={contracts.isPending}
      error={contracts.error}
      filtered={Boolean(status)}
      getRowHref={(c) => `/${slug}/contracts/${c.id}`}
      toolbar={(t) => (
        <DataTableToolbar
          table={t}
          state={table}
          searchPlaceholder="Search number, title, client…"
          filtered={Boolean(status)}
          onReset={() => void setStatus(null)}
          filters={
            <DataTableSelectFilter
              title="Status"
              value={status}
              options={STATUSES.map((s) => ({
                value: s,
                label: CONTRACT_STATUS_LABELS[s],
              }))}
              onChange={(v) => {
                void setStatus(v)
                table.resetPage()
              }}
            />
          }
          actions={
            <>
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
            </>
          }
        />
      )}
      empty={(filtered) =>
        filtered ? (
          <DataTableEmpty
            title="No matching contracts"
            description="Try a different search or status."
          />
        ) : (
          <DataTableEmpty
            title="No contracts yet"
            description="Write an agreement from a template, link it to a quote, and keep track of who signed and when."
          />
        )
      }
    />
  )
}
