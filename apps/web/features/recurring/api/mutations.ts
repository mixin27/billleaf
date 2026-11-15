"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateRecurringInvoiceInput,
  UpdateRecurringInvoiceInput,
} from "@workspace/contracts"

import { invoiceKeys } from "@/features/invoices"
import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { recurringKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: recurringKeys.all(workspaceId) }),
      qc.invalidateQueries({ queryKey: invoiceKeys.all(workspaceId) }),
      qc.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
    ])
}

const path = (id: string) => ({ params: { path: { id } } })

export function useCreateRecurring() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateRecurringInvoiceInput) =>
      unwrap(api.POST("/v1/recurring-invoices", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateRecurring(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateRecurringInvoiceInput) =>
      unwrap(
        api.PATCH("/v1/recurring-invoices/{id}", {
          ...path(id),
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useRunRecurring(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST("/v1/recurring-invoices/{id}/run", path(id))),
    onSuccess: invalidate,
  })
}

export function useDeleteRecurring(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/v1/recurring-invoices/{id}", path(id))),
    onSuccess: invalidate,
  })
}
