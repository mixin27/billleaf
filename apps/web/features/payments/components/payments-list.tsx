"use client"

import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type Payment,
  type PaymentStatus,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
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
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { usePayments } from "../api/queries"
import { PaymentActions } from "./payment-actions"

const STATUSES = [
  "completed",
  "refunded",
  "void",
] as const satisfies readonly PaymentStatus[]
const STATUS_LABELS = PAYMENT_STATUS_LABELS
const col = columnsFor<Payment>()

function useColumns(locale: string | undefined, slug: string | undefined) {
  return [
    col.accessor("paidOn", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { className: "text-muted-foreground" },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("receiptNumber", {
      header: "Receipt",
      meta: { label: "Receipt" },
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.receiptNumber}
          {row.original.status !== "completed" ? (
            <Badge variant="outline" className="ml-2">
              {STATUS_LABELS[row.original.status]}
            </Badge>
          ) : null}
        </span>
      ),
    }),
    col.accessor("clientName", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client" />
      ),
      enableSorting: true,
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
    col.accessor("method", {
      header: "Method",
      meta: {
        label: "Method",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => PAYMENT_METHOD_LABELS[getValue()],
    }),
    col.accessor("amount", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { align: "right", className: "tabular-nums" },
      cell: ({ row }) =>
        money(row.original.amount, row.original.currency, locale),
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => <PaymentActions payment={row.original} />,
    }),
  ]
}

export function PaymentsList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState({ sort: "paidOn:desc" })
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES)
  )
  const payments = usePayments({ ...table.query, status: status ?? undefined })

  return (
    <DataTable
      id="payments"
      columns={useColumns(locale, slug)}
      data={payments.data?.items}
      total={payments.data?.total}
      state={table}
      isLoading={payments.isPending}
      error={payments.error}
      filtered={Boolean(status)}
      toolbar={(t) => (
        <DataTableToolbar
          table={t}
          state={table}
          searchPlaceholder="Search receipt, invoice, client, reference…"
          filtered={Boolean(status)}
          onReset={() => void setStatus(null)}
          filters={
            <DataTableSelectFilter
              title="Status"
              value={status}
              options={STATUSES.map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
              }))}
              onChange={(v) => {
                void setStatus(v)
                table.resetPage()
              }}
            />
          }
        />
      )}
      empty={(filtered) =>
        filtered ? (
          <DataTableEmpty title="No matching payments" />
        ) : (
          <DataTableEmpty
            title="No payments yet"
            description="Record them from an issued invoice; each payment gets a receipt."
          />
        )
      }
    />
  )
}
