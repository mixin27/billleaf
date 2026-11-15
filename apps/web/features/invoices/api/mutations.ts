"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateInvoiceInput,
  SendDocumentInput,
  UpdateInvoiceInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { invoiceKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: invoiceKeys.all(workspaceId) }),
      // Quote pages show "Invoiced as …"
      qc.invalidateQueries({ queryKey: ["quotes", workspaceId] }),
    ])
}

const path = (id: string) => ({ params: { path: { id } } })

export function useCreateInvoice() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateInvoiceInput) =>
      unwrap(api.POST("/v1/invoices", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateInvoice(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateInvoiceInput) =>
      unwrap(
        api.PATCH("/v1/invoices/{id}", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

export type InvoiceAction = "issue" | "duplicate"

export function useInvoiceAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (action: InvoiceAction) =>
      action === "issue"
        ? unwrap(api.POST("/v1/invoices/{id}/issue", path(id)))
        : unwrap(api.POST("/v1/invoices/{id}/duplicate", path(id))),
    onSuccess: invalidate,
  })
}

export function useSendInvoice(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/invoices/{id}/send", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

export function useVoidInvoice(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/v1/invoices/{id}/void", { ...path(id), body: { reason } })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteInvoice(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/invoices/{id}", path(id))),
    onSuccess: invalidate,
  })
}
