"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { clientKeys, type ClientFilters } from "./keys"

const PAGE_SIZE = 25

/** Paginated client list (keyset cursor from the API). */
export function useClients(filters: ClientFilters) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: clientKeys.list(workspaceId, filters),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/clients", {
          params: {
            query: {
              q: filters.q || undefined,
              status: filters.status,
              limit: PAGE_SIZE,
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

export function useClient(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: clientKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/clients/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId),
  })
}
