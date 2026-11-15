"use client"

import {
  describeRecurrence,
  type RecurringInvoice,
  type RecurringStatus,
} from "@workspace/contracts"
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

import { useRecurringInvoices } from "../api/queries"
import { RecurringStatusBadge } from "./recurring-status-badge"

const STATUSES = [
  "active",
  "paused",
  "ended",
] as const satisfies readonly RecurringStatus[]
const STATUS_LABELS: Record<RecurringStatus, string> = {
  active: "Active",
  paused: "Paused",
  ended: "Ended",
}
const col = columnsFor<RecurringInvoice>()

function useColumns(locale: string | undefined) {
  return [
    col.accessor("clientName", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Client" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.clientName}</div>
          {row.original.title ? (
            <div className="text-xs text-muted-foreground">
              {row.original.title}
            </div>
          ) : null}
        </div>
      ),
    }),
    col.display({
      id: "frequency",
      header: "Frequency",
      meta: { label: "Frequency" },
      cell: ({ row }) => (
        <div>
          {describeRecurrence(row.original.every, row.original.unit)}
          <div className="text-xs text-muted-foreground">
            {row.original.mode === "send" ? "Auto-send" : "Draft for review"}
          </div>
        </div>
      ),
    }),
    col.accessor("nextRunDate", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Next" />
      ),
      enableSorting: true,
      meta: {
        label: "Next",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("total", {
      header: "Amount",
      meta: {
        label: "Amount",
        align: "right",
        hideBelow: "sm",
        className: "tabular-nums",
      },
      cell: ({ row }) =>
        money(row.original.total, row.original.currency, locale),
    }),
    col.accessor("status", {
      header: "Status",
      enableHiding: false,
      cell: ({ getValue }) => <RecurringStatusBadge status={getValue()} />,
    }),
  ]
}

export function RecurringList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState()
  const [status, setStatus] = useQueryState(
    "status",
    parseAsStringLiteral(STATUSES)
  )
  const schedules = useRecurringInvoices({
    ...table.query,
    status: status ?? undefined,
  })

  return (
    <DataTable
      id="recurring"
      columns={useColumns(locale)}
      data={schedules.data?.items}
      total={schedules.data?.total}
      state={table}
      isLoading={schedules.isPending}
      error={schedules.error}
      filtered={Boolean(status)}
      getRowHref={(r) => `/${slug}/invoices/recurring/${r.id}`}
      toolbar={(t) => (
        <DataTableToolbar
          table={t}
          state={table}
          searchPlaceholder="Search client or title…"
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
          actions={
            <Can permission="invoice.create">
              <Button
                nativeButton={false}
                render={<Link href={`/${slug}/invoices/recurring/new`} />}
              >
                New schedule
              </Button>
            </Can>
          }
        />
      )}
      empty={(filtered) =>
        filtered ? (
          <DataTableEmpty title="No matching schedules" />
        ) : (
          <DataTableEmpty
            title="No recurring invoices yet"
            description="Bill retainers and subscriptions automatically: Billleaf creates each invoice on schedule, as a draft or issued and emailed. Available on Pro and Team plans."
          />
        )
      }
    />
  )
}
