"use client"

import {
  ArrowLeft01Icon,
  ArrowLeftDoubleIcon,
  ArrowRight01Icon,
  ArrowRightDoubleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { PAGE_SIZE_OPTIONS } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import type { DataTableState } from "./use-data-table-state"

const SIZES = Object.fromEntries(
  PAGE_SIZE_OPTIONS.map((n) => [String(n), `${n} / page`])
)

/** "Showing 26–50 of 132" · page size · first/prev/next/last. */
export function DataTablePagination({
  state,
  total,
  showPageSize = true,
}: {
  state: DataTableState
  total: number
  /** Hide the size picker when the page size is fixed (e.g. card grids). */
  showPageSize?: boolean
}) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  const page = Math.min(state.page, pages)
  const from = (page - 1) * state.pageSize + 1
  const to = Math.min(total, page * state.pageSize)
  const nav = (
    target: number,
    label: string,
    icon: typeof ArrowLeft01Icon,
    disabled: boolean,
    className?: string
  ) => (
    <Button
      variant="outline"
      size="icon-sm"
      className={className}
      aria-label={label}
      disabled={disabled}
      onClick={() => state.setPage(target)}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        {showPageSize ? (
          <Select
            items={SIZES}
            value={String(state.pageSize)}
            onValueChange={(v) => v && state.setPageSize(Number(v))}
          >
            <SelectTrigger
              size="sm"
              className="w-28"
              aria-label="Rows per page"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <span className="text-muted-foreground tabular-nums">
          {page} / {pages}
        </span>
        <div className="flex items-center gap-1">
          {nav(
            1,
            "First page",
            ArrowLeftDoubleIcon,
            page <= 1,
            "hidden sm:inline-flex"
          )}
          {nav(page - 1, "Previous page", ArrowLeft01Icon, page <= 1)}
          {nav(page + 1, "Next page", ArrowRight01Icon, page >= pages)}
          {nav(
            pages,
            "Last page",
            ArrowRightDoubleIcon,
            page >= pages,
            "hidden sm:inline-flex"
          )}
        </div>
      </div>
    </div>
  )
}
