"use client"

import type { ListClientsQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { clientKeys, type ClientFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function useClients(query: ListClientsQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...clientKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/clients", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
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
