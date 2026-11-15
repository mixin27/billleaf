export const memberKeys = {
  all: (workspaceId: string | undefined) => ["members", workspaceId] as const,
  list: (workspaceId: string | undefined) =>
    [...memberKeys.all(workspaceId), "list"] as const,
  invitations: (workspaceId: string | undefined) =>
    [...memberKeys.all(workspaceId), "invitations"] as const,
}
