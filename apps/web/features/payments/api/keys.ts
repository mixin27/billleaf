import type { PaymentStatus } from "@workspace/contracts"

export interface PaymentFilters {
  invoiceId?: string
  clientId?: string
  status?: PaymentStatus
  q?: string
}

export const paymentKeys = {
  all: (workspaceId: string | undefined) => ["payments", workspaceId] as const,
  list: (
    workspaceId: string | undefined,
    filters: PaymentFilters,
    pageSize: number
  ) => [...paymentKeys.all(workspaceId), "list", filters, pageSize] as const,
}
