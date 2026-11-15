"use client"

import type { InvoiceDisplayStatus, InvoiceSummary } from "@workspace/contracts"
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
import { formatDate, money } from "@/lib/format"

import { useInvoices } from "../api/queries"
import {
  INVOICE_STATUS_LABELS,
  InvoiceStatusBadge,
} from "./invoice-status-badge"

const STATUSES = [
  "draft",
  "open",
  "overdue",
  "partially_paid",
  "paid",
  "void",
] as const satisfies readonly InvoiceDisplayStatus[]

const col = columnsFor<InvoiceSummary>()

function useColumns(locale: string | undefined) {
  return [
    col.accessor("number", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Number" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          {row.original.number ? (
            <span className="font-medium">{row.original.number}</span>
          ) : (
            <span className="text-muted-foreground">Draft</span>
          )}
          <div className="text-xs text-muted-foreground sm:hidden">
            {row.original.clientName}
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
    col.accessor("issueDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Issued" />
      ),
      enableSorting: true,
      meta: {
        label: "Issued",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("dueDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Due" />
      ),
      enableSorting: true,
      meta: {
        label: "Due",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("total", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Total" />
      ),
      enableSorting: true,
      meta: { label: "Total", align: "right", className: "tabular-nums" },
      cell: ({ row }) =>
        money(row.original.total, row.original.currency, locale),
    }),
    col.accessor("amountDue", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Due amount" />
      ),
      enableSorting: true,
      meta: {
        label: "Due amount",
        align: "right",
        hideBelow: "md",
        className: "tabular-nums",
      },
      cell: ({ row }) =>
        row.original.status === "issued"
          ? money(row.original.amountDue, row.original.currency, locale)
          : "—",
    }),
    col.accessor("displayStatus", {
      header: "Status",
      enableHiding: false,
      cell: ({ getValue }) => <InvoiceStatusBadge status={getValue()} />,
    }),
  ]
}

export function InvoicesList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState()
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES)
  )
  const invoices = useInvoices({ ...table.query, status: status ?? undefined })
  const columns = useColumns(locale)

  return (
    <DataTable
      id="invoices"
      columns={columns}
      data={invoices.data?.items}
      total={invoices.data?.total}
      state={table}
      isLoading={invoices.isPending}
      error={invoices.error}
      filtered={Boolean(status)}
      getRowHref={(i) => `/${slug}/invoices/${i.id}`}
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
                label: INVOICE_STATUS_LABELS[s],
              }))}
              onChange={(v) => {
                void setStatus(v)
                table.resetPage()
              }}
            />
          }
          actions={
            <Can permission="invoice.create">
              <Button
                nativeButton={false}
                render={<Link href={`/${slug}/invoices/new`} />}
              >
                New invoice
              </Button>
            </Can>
          }
        />
      )}
      empty={(filtered) =>
        filtered ? (
          <DataTableEmpty
            title="No matching invoices"
            description="Try a different search or status."
          />
        ) : (
          <DataTableEmpty
            title="No invoices yet"
            description="Create one from scratch, convert an accepted quote, or invoice tracked time."
          />
        )
      }
    />
  )
}
