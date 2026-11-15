"use client"

import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@workspace/contracts"
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"
import * as React from "react"

/**
 * Page, page size, sort and search in the URL (`?page=2&size=50&sort=total:desc&q=acme`)
 * so table views are shareable and survive reloads. Changing anything but the
 * page goes back to page 1. `search` is the live input; `q` is debounced.
 */
export function useDataTableState(defaults: { sort?: string } = {}) {
  const [state, setState] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    size: parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
    sort: parseAsString.withDefault(defaults.sort ?? ""),
    q: parseAsString.withDefault(""),
  })
  const [search, setSearch] = React.useState(state.q)

  React.useEffect(() => {
    if (search === state.q) return
    const t = setTimeout(
      () => void setState({ q: search || null, page: null }),
      250
    )
    return () => clearTimeout(t)
  }, [search, state.q, setState])

  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(state.size)
    ? state.size
    : DEFAULT_PAGE_SIZE

  return {
    page: Math.max(1, state.page),
    pageSize,
    sort: state.sort || undefined,
    q: state.q,
    search,
    setSearch,
    setPage: (page: number) => void setState({ page: page <= 1 ? null : page }),
    setPageSize: (size: number) =>
      void setState({
        size: size === DEFAULT_PAGE_SIZE ? null : size,
        page: null,
      }),
    setSort: (sort: string | null) =>
      void setState({
        sort: sort === (defaults.sort ?? null) ? null : sort,
        page: null,
      }),
    /** Call when another filter changes so the user lands on page 1. */
    resetPage: () => void setState({ page: null }),
    /** Query params for the API call. */
    query: {
      page: Math.max(1, state.page),
      pageSize,
      sort: state.sort || undefined,
      q: state.q || undefined,
    },
  }
}

export type DataTableState = ReturnType<typeof useDataTableState>
