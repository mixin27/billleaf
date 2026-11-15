"use client"

import type { QuoteStatus, QuoteSummary } from "@workspace/contracts"
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

import { useQuotes } from "../api/queries"
import { QUOTE_STATUS_LABELS, QuoteStatusBadge } from "./quote-status-badge"

const STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
] as const satisfies readonly QuoteStatus[]
const col = columnsFor<QuoteSummary>()

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
    col.accessor("title", {
      header: "Title",
      meta: {
        label: "Title",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => getValue() ?? "—",
    }),
    col.accessor("issueDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Issued" />
      ),
      enableSorting: true,
      meta: {
        label: "Issued",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("validUntil", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Valid until" />
      ),
      enableSorting: true,
      meta: {
        label: "Valid until",
        hideBelow: "lg",
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
    col.accessor("status", {
      header: "Status",
      enableHiding: false,
      cell: ({ row }) => <QuoteStatusBadge quote={row.original} />,
    }),
  ]
}

export function QuotesList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState()
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES)
  )
  const quotes = useQuotes({ ...table.query, status: status ?? undefined })

  return (
    <DataTable
      id="quotes"
      columns={useColumns(locale)}
      data={quotes.data?.items}
      total={quotes.data?.total}
      state={table}
      isLoading={quotes.isPending}
      error={quotes.error}
      filtered={Boolean(status)}
      getRowHref={(q) => `/${slug}/quotes/${q.id}`}
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
                label: QUOTE_STATUS_LABELS[s],
              }))}
              onChange={(v) => {
                void setStatus(v)
                table.resetPage()
              }}
            />
          }
          actions={
            <Can permission="quote.create">
              <Button
                nativeButton={false}
                render={<Link href={`/${slug}/quotes/new`} />}
              >
                New quote
              </Button>
            </Can>
          }
        />
      )}
      empty={(filtered) =>
        filtered ? (
          <DataTableEmpty
            title="No matching quotes"
            description="Try a different search or status."
          />
        ) : (
          <DataTableEmpty
            title="No quotes yet"
            description="Send a quote, get it accepted, then turn it into a contract, project or invoice."
          />
        )
      }
    />
  )
}
