import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table"
import type { RowData } from "@tanstack/react-table"

export interface DataTableColumnMeta {
  /** Name in the "View" menu (defaults to the column id). */
  label?: string
  /** Hide below this breakpoint (on top of the user's column choices). */
  hideBelow?: "sm" | "md" | "lg"
  align?: "right"
  className?: string
}

/**
 * Features every data table uses. Pagination and sorting are manual (the API
 * pages and sorts); visibility and selection are client-side.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

export type DataTableFeatures = typeof dataTableFeatures

/** Column helper bound to the shared features. */
export function columnsFor<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}
