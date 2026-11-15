"use client"

import type { ListPaymentsQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { paymentKeys, type PaymentFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function usePayments(query: ListPaymentsQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...paymentKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/payments", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: (prev) => prev,
  })
}
