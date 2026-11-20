import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  Quote,
  QuoteStatus,
  QuoteSummary,
  SendDocumentInput,
} from "@workspace/contracts"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"

import { api, apiHeaders, unwrap } from "@/lib/api"
import { API_URL } from "@/lib/config"
export {
  QUOTE_STATUS_LABELS,
  type QuoteDisplay,
  quoteDisplay,
} from "@/lib/quote-status"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same keys as the web (`apps/web/features/quotes/api/keys.ts`). */
export const quoteKeys = {
  all: (ws: string | undefined) => ["quotes", ws] as const,
  list: (
    ws: string | undefined,
    filters: { status?: QuoteStatus; clientId?: string }
  ) => ["quotes", ws, "list", filters] as const,
  detail: (ws: string | undefined, id: string) =>
    ["quotes", ws, "detail", id] as const,
}

export type QuoteFilter = "sent" | "draft" | "accepted" | "declined" | "all"

export const QUOTE_FILTERS: { value: QuoteFilter; label: string }[] = [
  { value: "sent", label: "Waiting" },
  { value: "draft", label: "Drafts" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "all", label: "All" },
]

/**
 * Quotes for a filter, newest first: the latest 50 (a client's: 100).
 * "Waiting" is sent and not answered yet, expired ones included.
 */
export function useQuotes(
  filter: QuoteFilter,
  clientId?: string,
  enabled = true
) {
  const ws = useWs()
  const status = filter === "all" ? undefined : filter
  return useQuery({
    queryKey: quoteKeys.list(ws, { status, clientId }),
    queryFn: () =>
      unwrap(
        api.GET("/v1/quotes", {
          params: {
            query: {
              status,
              clientId,
              sort: "createdAt:desc",
              pageSize: clientId ? 100 : 50,
            } as never,
          },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useQuote(id: string) {
  const ws = useWs()
  return useQuery({
    queryKey: quoteKeys.detail(ws, id),
    queryFn: () =>
      unwrap(api.GET("/v1/quotes/{id}", { params: { path: { id } } })),
    enabled: Boolean(ws && id),
  })
}

/** Quotes, clients (their history) and the dashboard's open quotes. */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWs()
  return (...more: string[]) =>
    Promise.all(
      ["quotes", "clients", "dashboard", ...more].map((k) =>
        qc.invalidateQueries({ queryKey: [k, ws] })
      )
    )
}

/**
 * Mark a draft as sent (it gets its number and can't be edited), or
 * record the client's answer to a sent quote.
 */
export function useQuoteStep(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (step: "send" | "accept" | "decline") => {
      const params = { params: { path: { id } } }
      return unwrap(
        step === "send"
          ? api.POST("/v1/quotes/{id}/send", params)
          : step === "accept"
            ? api.POST("/v1/quotes/{id}/accept", params)
            : api.POST("/v1/quotes/{id}/decline", params)
      )
    },
    onSettled: () => invalidate(),
  })
}

/** Email a sent quote, PDF attached (same recipient rules as invoices). */
export function useEmailQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/quotes/{id}/email", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSettled: () => invalidate(),
  })
}

/** A draft invoice from an accepted quote's lines. */
export function useInvoiceFromQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/invoices/from-quote/{quoteId}", {
          params: { path: { quoteId: id } },
        })
      ),
    onSuccess: () => invalidate("invoices"),
  })
}

/** A project for the client, with the quote's title and total. */
export function useProjectFromQuote(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/projects/from-quote/{quoteId}", {
          params: { path: { quoteId: id } },
        })
      ),
    onSuccess: () => invalidate("projects"),
  })
}

/** Download the PDF (it needs your session) and open the share sheet. */
export async function shareQuotePdf(quote: Quote) {
  const name = `${quote.number ?? "Draft quote"}.pdf`
  const file = await File.downloadFileAsync(
    `${API_URL}/v1/quotes/${quote.id}/pdf`,
    new File(Paths.cache, name),
    { headers: await apiHeaders(), idempotent: true }
  )
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: name,
  })
}
