import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  Invoice,
  InvoiceDisplayStatus,
  InvoiceSummary,
  RecordPaymentInput,
  SendDocumentInput,
} from "@workspace/contracts"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import { create } from "zustand"

import { api, apiHeaders, unwrap } from "@/lib/api"
import { API_URL } from "@/lib/config"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/**
 * Same key roots as the web (`apps/web/features/invoices/api/keys.ts`,
 * `features/payments`), so a payment recorded here refreshes the same
 * lists and the dashboard.
 */
export const invoiceKeys = {
  all: (ws: string | undefined) => ["invoices", ws] as const,
  list: (
    ws: string | undefined,
    filters: { status?: InvoiceDisplayStatus; clientId?: string },
    pageSize: number
  ) => ["invoices", ws, "list", filters, pageSize] as const,
  detail: (ws: string | undefined, id: string) =>
    ["invoices", ws, "detail", id] as const,
  payments: (ws: string | undefined, invoiceId: string) =>
    ["payments", ws, "list", { invoiceId }] as const,
}

/**
 * The list's filters. "unpaid" is everything still owed (open, partly
 * paid and overdue); the API filters one display status at a time.
 */
export type InvoiceFilter = "unpaid" | "overdue" | "draft" | "paid" | "all"

export const INVOICE_FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "draft", label: "Drafts" },
  { value: "paid", label: "Paid" },
  { value: "all", label: "All" },
]

/** Kept outside the screen so Home can open the list on a filter. */
export const useInvoiceFilter = create<{
  filter: InvoiceFilter
  setFilter: (f: InvoiceFilter) => void
}>((set) => ({ filter: "unpaid", setFilter: (filter) => set({ filter }) }))

const UNPAID: InvoiceDisplayStatus[] = ["overdue", "partially_paid", "open"]
const PAGE = 50

const QUERIES: Record<
  InvoiceFilter,
  { status?: InvoiceDisplayStatus; sort: string }[]
> = {
  // Overdue first, then by due date: what to chase next.
  unpaid: UNPAID.map((status) => ({ status, sort: "dueDate:asc" })),
  overdue: [{ status: "overdue", sort: "dueDate:asc" }],
  draft: [{ status: "draft", sort: "createdAt:desc" }],
  paid: [{ status: "paid", sort: "issueDate:desc" }],
  all: [{ sort: "createdAt:desc" }],
}

/** Invoices for a filter (the latest 50 of each status it covers). */
export function useInvoices(filter: InvoiceFilter, enabled = true) {
  const ws = useWs()
  const results = useQueries({
    queries: QUERIES[filter].map(({ status, sort }) => ({
      queryKey: invoiceKeys.list(ws, { status }, PAGE),
      enabled: Boolean(ws) && enabled,
      queryFn: () =>
        unwrap(
          api.GET("/v1/invoices", {
            params: { query: { status, sort, pageSize: PAGE } as never },
          })
        ),
    })),
  })
  const error = results.find((r) => r.error)?.error ?? null
  const done = results.every((r) => r.data)
  const items: InvoiceSummary[] | undefined = done
    ? results.flatMap((r) => r.data!.items)
    : undefined
  const more = results.some((r) => r.data && r.data.total > r.data.items.length)
  return {
    items,
    error,
    /** Some invoices didn't fit (the web has them all). */
    more,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  }
}

/**
 * One client's invoices: everything still owed (overdue first), and the
 * latest few of the rest.
 */
export function useClientInvoices(clientId: string, enabled = true) {
  const ws = useWs()
  const lists = [
    ...UNPAID.map((status) => ({ status, sort: "dueDate:asc", size: 100 })),
    { status: undefined, sort: "createdAt:desc", size: 10 },
  ]
  const results = useQueries({
    queries: lists.map(({ status, sort, size }) => ({
      queryKey: invoiceKeys.list(ws, { status, clientId }, size),
      enabled: Boolean(ws && clientId) && enabled,
      queryFn: () =>
        unwrap(
          api.GET("/v1/invoices", {
            params: {
              query: { status, clientId, sort, pageSize: size } as never,
            },
          })
        ),
    })),
  })
  const error = results.find((r) => r.error)?.error ?? null
  const done = results.every((r) => r.data)
  const unpaid = done
    ? results.slice(0, UNPAID.length).flatMap((r) => r.data!.items)
    : undefined
  const owed = new Set(unpaid?.map((i) => i.id))
  const recent = done
    ? results
        .at(-1)!
        .data!.items.filter((i) => !owed.has(i.id))
        .slice(0, 5)
    : undefined
  return {
    unpaid,
    recent,
    error,
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  }
}

export function useInvoice(id: string) {
  const ws = useWs()
  return useQuery({
    queryKey: invoiceKeys.detail(ws, id),
    queryFn: () =>
      unwrap(api.GET("/v1/invoices/{id}", { params: { path: { id } } })),
    enabled: Boolean(ws && id),
  })
}

/** Payments recorded against an invoice (needs `payment.read`). */
export function useInvoicePayments(invoiceId: string, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: invoiceKeys.payments(ws, invoiceId),
    queryFn: () =>
      unwrap(
        api.GET("/v1/payments", {
          params: {
            query: { invoiceId, sort: "paidOn:asc", pageSize: 100 } as never,
          },
        })
      ),
    enabled: Boolean(ws && invoiceId) && enabled,
  })
}

/** Everything a payment changes: invoices, payments and the dashboard. */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWs()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: invoiceKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["payments", ws] }),
      qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
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
    onSettled: invalidate,
  })
}

/** A payment recorded by mistake: off the invoice, receipt void, not income. */
export function useVoidPayment(paymentId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/v1/payments/{id}/void", {
          params: { path: { id: paymentId } },
          body: { reason },
        })
      ),
    onSettled: invalidate,
  })
}

/**
 * Email the invoice (PDF attached). Without `to`, the API picks the
 * client's primary contact, else the client email.
 */
export function useSendInvoice(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/invoices/{id}/send", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSettled: invalidate,
  })
}

/** Email a payment's receipt (PDF attached); same recipient rules. */
export function useSendReceipt(paymentId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/payments/{id}/receipt/send", {
          params: { path: { id: paymentId } },
          body: body as never,
        })
      ),
    onSettled: invalidate,
  })
}

/**
 * Download the PDF (it needs your session, so the browser can't open it)
 * and hand it to the share sheet: Mail, Messages, Save to Files, print.
 */
export async function shareInvoicePdf(invoice: Invoice) {
  const name = `${invoice.number ?? "Draft invoice"}.pdf`
  const file = await File.downloadFileAsync(
    `${API_URL}/v1/invoices/${invoice.id}/pdf`,
    new File(Paths.cache, name),
    { headers: await apiHeaders(), idempotent: true }
  )
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: name,
  })
}

/** Status words as the web badges say them. */
export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  open: "Open",
  overdue: "Overdue",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
}
