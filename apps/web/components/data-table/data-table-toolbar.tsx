"use client"

import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import type * as React from "react"

import type { DataTableInstance } from "./data-table"
import { DataTableViewOptions } from "./data-table-view-options"
import type { DataTableState } from "./use-data-table-state"

/**
 * Search · filters · Reset ………… View · actions. Wraps on small screens.
 */
export function DataTableToolbar<TData extends { id: string }>({
  table,
  state,
  searchPlaceholder = "Search…",
  filters,
  filtered,
  onReset,
  actions,
}: {
  table: DataTableInstance<TData>
  state: DataTableState
  searchPlaceholder?: string
  filters?: React.ReactNode
  /** True when any filter besides search is active. */
  filtered?: boolean
  onReset?: () => void
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search"
          />
        </div>
        {filters}
        {state.q || filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              state.setSearch("")
              onReset?.()
            }}
          >
            Reset
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <DataTableViewOptions table={table} />
        {actions}
      </div>
    </div>
  )
}
