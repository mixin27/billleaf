"use client"

import type { CreditNoteSummary } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import Link from "next/link"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useCreditNotes } from "../api/queries"

const col = columnsFor<CreditNoteSummary>()

/** Invoices → Credit notes: every credit note, newest first. */
export function CreditNotesList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState({ sort: "createdAt:desc" })
  const notes = useCreditNotes(table.query)

  const columns = [
    col.accessor("issueDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { className: "text-muted-foreground" },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("number", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Credit note" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">
            {row.original.number}
            {row.original.status === "void" ? (
              <Badge variant="secondary" className="ml-2">
                Void
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.reason}
          </span>
        </span>
      ),
    }),
    col.accessor("clientName", {
      header: "Client",
      meta: { label: "Client", hideBelow: "sm" },
    }),
    col.accessor("invoiceNumber", {
      header: "Invoice",
      meta: { label: "Invoice", hideBelow: "md" },
      cell: ({ row }) => (
        <Link
          className="underline"
          href={`/${slug}/invoices/${row.original.invoiceId}`}
        >
          {row.original.invoiceNumber}
        </Link>
      ),
    }),
    col.accessor("total", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Credit" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { align: "right", className: "tabular-nums" },
      cell: ({ row }) => (
        <span className="flex flex-col items-end">
          <span>
            {money(row.original.total, row.original.currency, locale)}
          </span>
          {row.original.status === "issued" && row.original.refundAmount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {money(row.original.refundAmount, row.original.currency, locale)}{" "}
              refund due
            </span>
          ) : null}
        </span>
      ),
    }),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credit notes"
        breadcrumb="Credit notes"
        description="Corrections to issued invoices. Issue them from an invoice's More menu."
      />
      <DataTable
        id="credit-notes"
        columns={columns}
        data={notes.data?.items}
        total={notes.data?.total}
        state={table}
        isLoading={notes.isPending}
        error={notes.error}
        filtered={false}
        toolbar={(t) => (
          <DataTableToolbar
            table={t}
            state={table}
            searchPlaceholder="Search number, invoice, client, reason…"
            filtered={false}
            onReset={() => undefined}
          />
        )}
        empty={() => (
          <DataTableEmpty
            title="No credit notes"
            description="When an issued invoice needs a correction or partial refund, issue a credit note from it."
          />
        )}
      />
    </div>
  )
}
