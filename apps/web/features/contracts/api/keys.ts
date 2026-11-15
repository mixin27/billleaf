import type { ContractStatus } from "@workspace/contracts"

export interface ContractFilters {
  status?: ContractStatus
  clientId?: string
  q?: string
}

export const contractKeys = {
  all: (workspaceId: string | undefined) => ["contracts", workspaceId] as const,
  list: (
    workspaceId: string | undefined,
    filters: ContractFilters,
    pageSize: number
  ) => [...contractKeys.all(workspaceId), "list", filters, pageSize] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...contractKeys.all(workspaceId), "detail", id] as const,
  templates: (workspaceId: string | undefined) =>
    [...contractKeys.all(workspaceId), "templates"] as const,
  template: (workspaceId: string | undefined, id: string) =>
    [...contractKeys.all(workspaceId), "templates", id] as const,
}
