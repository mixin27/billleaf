import type { ProjectStatus } from "@workspace/contracts"

export interface ProjectFilters {
  status?: ProjectStatus
  clientId?: string
  q?: string
}

export const projectKeys = {
  all: (workspaceId: string | undefined) => ["projects", workspaceId] as const,
  list: (
    workspaceId: string | undefined,
    filters: ProjectFilters,
    pageSize: number
  ) => [...projectKeys.all(workspaceId), "list", filters, pageSize] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...projectKeys.all(workspaceId), "detail", id] as const,
  tasks: (workspaceId: string | undefined, id: string) =>
    [...projectKeys.all(workspaceId), "tasks", id] as const,
}
