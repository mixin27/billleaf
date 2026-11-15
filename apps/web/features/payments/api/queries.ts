"use client"

import { useInfiniteQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { paymentKeys, type PaymentFilters } from "./keys"

export function usePayments(
  filters: PaymentFilters,
  pageSize = 25,
  enabled = true
) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: paymentKeys.list(workspaceId, filters, pageSize),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/payments", {
          params: {
            query: {
              invoiceId: filters.invoiceId,
              clientId: filters.clientId,
              status: filters.status,
              q: filters.q || undefined,
              limit: pageSize,
              cursor: pageParam ?? undefined,
            },
          },
        })
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: (prev) => prev,
  })
}
