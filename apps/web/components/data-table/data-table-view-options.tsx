"use client"

import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { DataTableInstance } from "./data-table"

/** Show/hide columns; the choice is remembered per table. */
export function DataTableViewOptions<TData extends { id: string }>({
  table,
}: {
  table: DataTableInstance<TData>
}) {
  const columns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.columnDef.meta?.label)
  if (columns.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <HugeiconsIcon icon={SlidersHorizontalIcon} />
            View
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {columns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={c.getIsVisible()}
              onCheckedChange={(v) => c.toggleVisibility(Boolean(v))}
            >
              {c.columnDef.meta?.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
