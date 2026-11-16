"use client"

import type { AuditEntry, AuditList } from "@workspace/contracts"
import Link from "next/link"
import { parseAsString, useQueryState } from "nuqs"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableSelectFilter,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"

const AREAS = [
  "admin.",
  "billing.",
  "client.",
  "contract.",
  "invoice.",
  "member.",
  "payment.",
  "payment_proof.",
  "quote.",
  "role.",
  "time.",
] as const

const col = columnsFor<AuditEntry>()

/** "invoice.sent" → "Invoice sent". */
export function actionLabel(action: string) {
  const s = action.replace(/[._]/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function details(e: AuditEntry) {
  const m = e.metadata ?? {}
  const bits = [
    typeof m.reason === "string" ? `“${m.reason}”` : null,
    typeof m.email === "string" ? m.email : null,
    typeof m.planKey === "string" ? `plan ${m.planKey}` : null,
    typeof m.to === "string" ? `to ${m.to}` : null,
  ].filter(Boolean)
  return bits.join(" · ")
}

/** Shared audit table state: page/sort/search (actor) + action area. */
export function useAuditState() {
  const table = useDataTableState({ sort: "createdAt:desc" })
  const [area, setArea] = useQueryState("area", parseAsString)
  return {
    table,
    area,
    setArea,
    query: {
      page: table.page,
      pageSize: table.pageSize,
      sort: table.sort,
      actor: table.q || undefined,
      action: area ?? undefined,
    },
  }
}

export function AuditLog({
  state,
  result,
  showWorkspace,
}: {
  state: ReturnType<typeof useAuditState>
  result: { data?: AuditList; isPending: boolean; error: Error | null }
  /** Admin view: link each entry's workspace. */
  showWorkspace?: boolean
}) {
  const { table, area, setArea } = state
  const fmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  const columns = [
    col.accessor("createdAt", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="When" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { className: "whitespace-nowrap text-muted-foreground" },
      cell: ({ getValue }) => fmt.format(new Date(getValue())),
    }),
    col.accessor("action", {
      header: "What",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium">{actionLabel(row.original.action)}</p>
          {details(row.original) ? (
            <p className="max-w-md truncate text-xs text-muted-foreground">
              {details(row.original)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground sm:hidden">
            {row.original.actor?.email ?? "System"}
          </p>
        </div>
      ),
    }),
    col.accessor((r) => r.actor?.email ?? "", {
      id: "actor",
      header: "Who",
      meta: { label: "Who", hideBelow: "sm" },
      cell: ({ row }) =>
        row.original.actor ? (
          <div className="min-w-0">
            <p className="truncate">{row.original.actor.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.actor.email}
            </p>
            {row.original.apiKey ? (
              <p className="truncate text-xs text-muted-foreground">
                via API key “{row.original.apiKey.name}”
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">System</span>
        ),
    }),
    ...(showWorkspace
      ? [
          col.accessor((r) => r.workspace?.name ?? "", {
            id: "workspace",
            header: "Workspace",
            meta: { label: "Workspace", hideBelow: "md" },
            cell: ({ row }) =>
              row.original.workspace ? (
                <Link
                  className="underline"
                  href={`/admin/workspaces/${row.original.workspace.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {row.original.workspace.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Platform</span>
              ),
          }),
        ]
      : []),
    col.accessor("ipAddress", {
      header: "IP",
      meta: {
        label: "IP address",
        hideBelow: "lg",
        className: "font-mono text-xs text-muted-foreground",
      },
      cell: ({ getValue }) => getValue() ?? "—",
    }),
  ]

  return (
    <DataTable
      id={showWorkspace ? "admin-audit" : "audit"}
      columns={columns}
      data={result.data?.items}
      total={result.data?.total}
      state={table}
      isLoading={result.isPending}
      error={result.error}
      filtered={Boolean(area)}
      empty={(filtered) => (
        <DataTableEmpty
          title={filtered ? "No matching entries" : "Nothing recorded yet"}
          description={
            filtered
              ? "Try another area or person."
              : "Changes to documents, payments, members and settings appear here."
          }
        />
      )}
      toolbar={(t) => (
        <DataTableToolbar
          table={t}
          state={table}
          searchPlaceholder="Search by person…"
          filtered={Boolean(area)}
          onReset={() => void setArea(null)}
          filters={
            <DataTableSelectFilter
              title="Area"
              value={(area as (typeof AREAS)[number] | null) ?? null}
              options={AREAS.filter((a) => showWorkspace || a !== "admin.").map(
                (a) => ({ value: a, label: actionLabel(a.slice(0, -1)) })
              )}
              onChange={(v) => {
                void setArea(v)
                table.resetPage()
              }}
            />
          }
        />
      )}
    />
  )
}
