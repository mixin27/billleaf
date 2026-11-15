"use client"

import type { ListContractsQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { contractKeys, type ContractFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function useContracts(query: ListContractsQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...contractKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/contracts", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
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
