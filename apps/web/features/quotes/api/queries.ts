"use client"

import type { ListQuotesQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { quoteKeys, type QuoteFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function useQuotes(query: ListQuotesQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...quoteKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/quotes", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useQuote(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: quoteKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/quotes/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId && id),
  })
}
