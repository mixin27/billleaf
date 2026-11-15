import type { QuoteStatus } from "@workspace/contracts"

export interface QuoteFilters {
  status?: QuoteStatus
  clientId?: string
  q?: string
}

export const quoteKeys = {
  all: (workspaceId: string | undefined) => ["quotes", workspaceId] as const,
  lists: (workspaceId: string | undefined) =>
    [...quoteKeys.all(workspaceId), "list"] as const,
  list: (workspaceId: string | undefined, filters: QuoteFilters) =>
    [...quoteKeys.lists(workspaceId), filters] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...quoteKeys.all(workspaceId), "detail", id] as const,
}
