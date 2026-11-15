"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateQuoteInput,
  SendDocumentInput,
  UpdateQuoteInput,
} from "@workspace/contracts"

import { clientKeys } from "@/features/clients"
import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { quoteKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
      qc.invalidateQueries({ queryKey: quoteKeys.all(workspaceId) }),
      qc.invalidateQueries({ queryKey: clientKeys.all(workspaceId) }),
    ])
}

const path = (id: string) => ({ params: { path: { id } } })

export function useCreateQuote() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateQuoteInput) =>
      unwrap(api.POST("/v1/quotes", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateQuoteInput) =>
      unwrap(
        api.PATCH("/v1/quotes/{id}", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

export type QuoteAction = "send" | "accept" | "decline" | "duplicate"

export function useQuoteAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (action: QuoteAction) => {
      switch (action) {
        case "send":
          return unwrap(api.POST("/v1/quotes/{id}/send", path(id)))
        case "accept":
          return unwrap(api.POST("/v1/quotes/{id}/accept", path(id)))
        case "decline":
          return unwrap(api.POST("/v1/quotes/{id}/decline", path(id)))
        case "duplicate":
          return unwrap(api.POST("/v1/quotes/{id}/duplicate", path(id)))
      }
    },
    onSuccess: invalidate,
  })
}

export function useDeleteQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/quotes/{id}", path(id))),
    onSuccess: invalidate,
  })
}

export function useEmailQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/quotes/{id}/email", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

/** Accepted quote → draft invoice. */
export function useConvertQuote(id: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidate()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/invoices/from-quote/{quoteId}", {
          params: { path: { quoteId: id } },
        })
      ),
    onSuccess: () =>
      Promise.all([
        invalidate(),
        qc.invalidateQueries({ queryKey: ["invoices", workspaceId] }),
      ]),
  })
}
