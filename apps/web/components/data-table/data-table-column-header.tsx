"use client"

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Column, RowData } from "@tanstack/react-table"
import { cn } from "@workspace/ui/lib/utils"

import type { DataTableFeatures } from "./features"

/** Header label that toggles server sorting: none → asc → desc → none. */
export function DataTableColumnHeader<TData extends RowData>({
  column,
  title,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: Column<DataTableFeatures, TData, any>
  title: string
  className?: string
}) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>
  const sorted = column.getIsSorted()
  const right = column.columnDef.meta?.align === "right"
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground",
        right && "flex-row-reverse",
        sorted && "text-foreground",
        className
      )}
      aria-label={`Sort by ${title}${sorted ? ` (${sorted === "asc" ? "ascending" : "descending"})` : ""}`}
    >
      {title}
      <HugeiconsIcon
        icon={
          sorted === "asc"
            ? ArrowUp01Icon
            : sorted === "desc"
              ? ArrowDown01Icon
              : ArrowUpDownIcon
        }
        className={cn("size-3.5", !sorted && "opacity-40")}
      />
    </button>
  )
}
