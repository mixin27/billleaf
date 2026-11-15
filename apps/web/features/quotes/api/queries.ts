"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { quoteKeys, type QuoteFilters } from "./keys"

export function useQuotes(filters: QuoteFilters, pageSize = 25) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: [...quoteKeys.list(workspaceId, filters), pageSize],
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/quotes", {
          params: {
            query: {
              status: filters.status,
              clientId: filters.clientId,
              q: filters.q || undefined,
              limit: pageSize,
              cursor: pageParam ?? undefined,
            },
          },
        })
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(workspaceId),
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
