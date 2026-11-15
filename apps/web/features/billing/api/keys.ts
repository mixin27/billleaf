export const billingKeys = {
  all: (workspaceId: string | undefined) => ["billing", workspaceId] as const,
  overview: (workspaceId: string | undefined) =>
    [...billingKeys.all(workspaceId), "overview"] as const,
  manual: (workspaceId: string | undefined) =>
    [...billingKeys.all(workspaceId), "manual"] as const,
  testSession: (workspaceId: string | undefined, session: string) =>
    [...billingKeys.all(workspaceId), "test-session", session] as const,
}
