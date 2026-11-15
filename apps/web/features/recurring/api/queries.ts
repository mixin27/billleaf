"use client"

import { useQuery } from "@tanstack/react-query"
import type { ListRecurringQuery } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { recurringKeys } from "./keys"

export function useRecurringInvoices(query: ListRecurringQuery) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...recurringKeys.list(workspaceId), query],
    queryFn: () =>
      unwrap(
        api.GET("/v1/recurring-invoices", {
          params: { query: query as never },
        })
      ),
    enabled: Boolean(workspaceId),
    placeholderData: (prev) => prev,
  })
}

export function useRecurringInvoice(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: recurringKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/recurring-invoices/{id}", { params: { path: { id } } })
      ),
    enabled: Boolean(workspaceId),
  })
}

export function useRecurringHistory(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: recurringKeys.history(workspaceId, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/recurring-invoices/{id}/invoices", {
          params: { path: { id } },
        })
      ),
    enabled: Boolean(workspaceId),
  })
}
