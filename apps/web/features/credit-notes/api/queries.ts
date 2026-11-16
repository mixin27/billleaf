"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreateCreditNoteInput,
  ListCreditNotesQuery,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

export const creditNoteKeys = {
  all: (ws: string | undefined) => ["credit-notes", ws] as const,
}

export function useCreditNotes(query: ListCreditNotesQuery, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...creditNoteKeys.all(ws), "list", query],
    queryFn: () =>
      unwrap(
        api.GET("/v1/credit-notes", { params: { query: query as never } })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

/** Credit notes change invoice balances: refresh invoices and dashboard too. */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: creditNoteKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["invoices", ws] }),
      qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
    ])
}

export function useCreateCreditNote(invoiceId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateCreditNoteInput) =>
      unwrap(
        api.POST("/v1/invoices/{id}/credit-notes", {
          params: { path: { id: invoiceId } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useVoidCreditNote() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(
        api.POST("/v1/credit-notes/{id}/void", {
          params: { path: { id } },
          body: { reason },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useSendCreditNote() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      to?: string
      message?: string
    }) =>
      unwrap(
        api.POST("/v1/credit-notes/{id}/send", {
          params: { path: { id } },
          body,
        })
      ),
    onSuccess: invalidate,
  })
}
