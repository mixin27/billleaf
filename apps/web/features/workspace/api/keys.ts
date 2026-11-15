/** Query-key factory — every key for this feature starts with ["workspace"]. */
export const workspaceKeys = {
  all: ["workspace"] as const,
  list: () => [...workspaceKeys.all, "list"] as const,
  me: (workspaceId: string | undefined) =>
    [...workspaceKeys.all, "me", workspaceId] as const,
  profile: (workspaceId: string | undefined) =>
    [...workspaceKeys.all, "profile", workspaceId] as const,
}
