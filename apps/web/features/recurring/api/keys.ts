export const recurringKeys = {
  all: (workspaceId: string | undefined) => ["recurring", workspaceId] as const,
  list: (workspaceId: string | undefined) =>
    [...recurringKeys.all(workspaceId), "list"] as const,
  detail: (workspaceId: string | undefined, id: string) =>
    [...recurringKeys.all(workspaceId), "detail", id] as const,
  history: (workspaceId: string | undefined, id: string) =>
    [...recurringKeys.all(workspaceId), "history", id] as const,
}
