import type { InvoiceDisplayStatus } from "@workspace/contracts"

export interface InvoiceFilters {
  status?: InvoiceDisplayStatus
  clientId?: string
  q?: string
}

export const invoiceKeys = {
  all: (workspaceId: string | undefined) => ["invoices", workspaceId] as const,
  list: (
    workspaceId: string | undefined,
    filters: InvoiceFilters,
    pageSize: number
  ) => [...invoiceKeys.all(workspaceId), "list", filters, pageSize] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...invoiceKeys.all(workspaceId), "detail", id] as const,
}
