"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  RecordPaymentInput,
  SendDocumentInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { paymentKeys } from "./keys"

/** Payments change invoice balances/status, so refresh both. */
function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
      qc.invalidateQueries({ queryKey: paymentKeys.all(workspaceId) }),
      qc.invalidateQueries({ queryKey: ["invoices", workspaceId] }),
    ])
}

export function useRecordPayment(invoiceId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: RecordPaymentInput) =>
      unwrap(
        api.POST("/v1/invoices/{invoiceId}/payments", {
          params: { path: { invoiceId } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useRefundPayment(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/v1/payments/{id}/refund", {
          params: { path: { id } },
          body: { reason },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useVoidPayment(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/v1/payments/{id}/void", {
          params: { path: { id } },
          body: { reason },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useSendReceipt(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/payments/{id}/receipt/send", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}
