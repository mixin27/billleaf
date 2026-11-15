"use client"

import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type ColumnVisibilityState as VisibilityState,
  useTable,
} from "@tanstack/react-table"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import { useRouter } from "next/navigation"
import * as React from "react"

import { DataTablePagination } from "./data-table-pagination"
import {
  type DataTableColumnMeta,
  dataTableFeatures,
  type DataTableFeatures,
} from "./features"
import type { DataTableState } from "./use-data-table-state"

const HIDE_BELOW: Record<
  NonNullable<DataTableColumnMeta["hideBelow"]>,
  string
> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
}

function cellClass(meta: DataTableColumnMeta | undefined) {
  return cn(
    meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
    meta?.align === "right" && "text-right",
    meta?.className
  )
}

function toSorting(sort: string | undefined): SortingState {
  if (!sort) return []
  const [id, dir] = sort.split(":")
  return id ? [{ id, desc: dir === "desc" }] : []
}

function readVisibility(key: string): VisibilityState {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as VisibilityState
  } catch {
    return {}
  }
}

export interface DataTableProps<TData extends { id: string }> {
  /** Stable id, used to remember column choices per table. */
  id: string
  // Column value types vary per column; the helper's columns are accepted as-is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<DataTableFeatures, TData, any>[]
  data: TData[] | undefined
  total: number | undefined
  state: DataTableState
  isLoading?: boolean
  error?: Error | null
  /** Clicking (or Enter on) a row opens this URL. */
  getRowHref?: (row: TData) => string
  /** Show selection checkboxes; selection is cleared when the page changes. */
  selectable?: boolean
  onSelectionChange?: (rows: TData[]) => void
  /** Rendered when there are no rows; `filtered` = a search/filter is active. */
  empty: (filtered: boolean) => React.ReactNode
  /** True when filters beyond search are active (for the empty state). */
  filtered?: boolean
  toolbar?: (table: DataTableInstance<TData>) => React.ReactNode
}

export type DataTableInstance<TData extends { id: string }> = ReturnType<
  typeof useTable<DataTableFeatures, TData>
>

/**
 * Server-paginated, server-sorted table (TanStack Table v9, manual mode).
 * URL state comes from `useDataTableState`; the caller fetches with
 * `state.query` and passes `data` + `total`.
 */
export function DataTable<TData extends { id: string }>({
  id,
  columns,
  data,
  total,
  state,
  isLoading,
  error,
  getRowHref,
  selectable,
  onSelectionChange,
  empty,
  filtered,
  toolbar,
}: DataTableProps<TData>) {
  const router = useRouter()
  const storageKey = `billleaf.table.${id}.columns`
  const [visibility, setVisibility] = React.useState<VisibilityState>({})
  React.useEffect(() => setVisibility(readVisibility(storageKey)), [storageKey])
  const [selection, setSelection] = React.useState<RowSelectionState>({})
  React.useEffect(
    () => setSelection({}),
    [state.page, state.pageSize, state.sort, state.q]
  )

  const rows = React.useMemo(() => data ?? [], [data])
  const sortable = React.useMemo(
    () =>
      columns.map((c) => ({ ...c, enableSorting: c.enableSorting ?? false })),
    [columns]
  )

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    columns: sortable,
    data: rows,
    getRowId: (r) => r.id,
    manualPagination: true,
    manualSorting: true,
    rowCount: total ?? 0,
    enableRowSelection: Boolean(selectable),
    state: {
      sorting: toSorting(state.sort),
      pagination: { pageIndex: state.page - 1, pageSize: state.pageSize },
      columnVisibility: visibility,
      rowSelection: selection,
    },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(toSorting(state.sort)) : updater
      const s = next[0]
      state.setSort(s ? `${s.id}:${s.desc ? "desc" : "asc"}` : null)
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: state.page - 1, pageSize: state.pageSize }
      const next = typeof updater === "function" ? updater(current) : updater
      if (next.pageSize !== current.pageSize) state.setPageSize(next.pageSize)
      else state.setPage(next.pageIndex + 1)
    },
    onColumnVisibilityChange: (updater) => {
      setVisibility((prev: VisibilityState) => {
        const next = typeof updater === "function" ? updater(prev) : updater
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // Storage unavailable: keep the choice for this session only.
        }
        return next
      })
    },
    onRowSelectionChange: (updater) =>
      setSelection((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      ),
  })

  React.useEffect(() => {
    if (!onSelectionChange) return
    onSelectionChange(rows.filter((r) => selection[r.id]))
  }, [selection, rows, onSelectionChange])

  const visibleColumns = table.getVisibleLeafColumns().length
  const bodyRows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-3">
      {toolbar?.(table)}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cellClass(header.column.columnDef.meta)}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: Math.min(state.pageSize, 8) }, (_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  <TableCell colSpan={visibleColumns}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : error ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={visibleColumns}
                  className="py-10 text-center text-sm text-destructive"
                >
                  {error.message}
                </TableCell>
              </TableRow>
            ) : bodyRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns} className="p-0">
                  {empty(Boolean(state.q) || Boolean(filtered))}
                </TableCell>
              </TableRow>
            ) : (
              bodyRows.map((row) => {
                const href = getRowHref?.(row.original)
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(href && "cursor-pointer")}
                    tabIndex={href ? 0 : undefined}
                    onClick={(e) => {
                      if (!href) return
                      // Let links, buttons and checkboxes inside the row work.
                      if (
                        (e.target as HTMLElement).closest(
                          "a,button,input,[role=checkbox],[role=menuitem]"
                        )
                      )
                        return
                      if (e.metaKey || e.ctrlKey) window.open(href, "_blank")
                      else router.push(href)
                    }}
                    onKeyDown={(e) => {
                      if (
                        href &&
                        e.key === "Enter" &&
                        e.target === e.currentTarget
                      )
                        router.push(href)
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cellClass(cell.column.columnDef.meta)}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {total !== undefined && total > 0 ? (
        <DataTablePagination state={state} total={total} />
      ) : null}
    </div>
  )
}
