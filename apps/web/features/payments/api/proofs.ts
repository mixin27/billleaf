"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  ConfirmPaymentProofInput,
  ListPaymentProofsQuery,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { paymentKeys } from "./keys"

export function usePaymentProofs(
  query: ListPaymentProofsQuery,
  enabled = true
) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...paymentKeys.all(ws), "proofs", query],
    queryFn: () =>
      unwrap(
        api.GET("/v1/payment-proofs", { params: { query: query as never } })
      ),
    enabled: Boolean(ws) && enabled,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: paymentKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["invoices", ws] }),
      qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
    ])
}

export function useConfirmProof() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: ConfirmPaymentProofInput & { id: string }) =>
      unwrap(
        api.POST("/v1/payment-proofs/{id}/confirm", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useRejectProof() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(
        api.POST("/v1/payment-proofs/{id}/reject", {
          params: { path: { id } },
          body: { reason },
        })
      ),
    onSuccess: invalidate,
  })
}
