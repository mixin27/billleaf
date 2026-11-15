export const roleKeys = {
  all: (workspaceId: string | undefined) => ["roles", workspaceId] as const,
  list: (workspaceId: string | undefined) =>
    [...roleKeys.all(workspaceId), "list"] as const,
  catalog: () => ["permissions", "catalog"] as const,
}
