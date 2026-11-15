export interface ClientFilters {
  q?: string
  status: "active" | "archived"
}

/** Query-key factory — keys include the workspace so switching workspaces never mixes data. */
export const clientKeys = {
  all: (workspaceId: string | undefined) => ["clients", workspaceId] as const,
  lists: (workspaceId: string | undefined) =>
    [...clientKeys.all(workspaceId), "list"] as const,
  list: (workspaceId: string | undefined, filters: ClientFilters) =>
    [...clientKeys.lists(workspaceId), filters] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...clientKeys.all(workspaceId), "detail", id] as const,
}
