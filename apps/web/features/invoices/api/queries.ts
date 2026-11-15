"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { invoiceKeys, type InvoiceFilters } from "./keys"

export function useInvoices(filters: InvoiceFilters, pageSize = 25) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: invoiceKeys.list(workspaceId, filters, pageSize),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/invoices", {
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

export function useInvoice(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: invoiceKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/invoices/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId),
  })
}
