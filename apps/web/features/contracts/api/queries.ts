"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { contractKeys, type ContractFilters } from "./keys"

export function useContracts(filters: ContractFilters, pageSize = 25) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: contractKeys.list(workspaceId, filters, pageSize),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/contracts", {
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

export function useContract(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: contractKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/contracts/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId),
  })
}

export function useContractTemplates() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: contractKeys.templates(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/contract-templates")),
    enabled: Boolean(workspaceId),
  })
}

export function useContractTemplate(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: contractKeys.template(workspaceId, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/contract-templates/{id}", { params: { path: { id } } })
      ),
    enabled: Boolean(workspaceId),
  })
}
