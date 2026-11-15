"use client"

import type { ListInvoicesQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { invoiceKeys, type InvoiceFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function useInvoices(query: ListInvoicesQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...invoiceKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/invoices", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useInvoice(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: invoiceKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/invoices/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId),
  })
}
