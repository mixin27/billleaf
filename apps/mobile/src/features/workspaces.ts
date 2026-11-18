import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { useWorkspaceStore } from "@/stores/workspace-store"

export const workspacesKey = ["workspaces"] as const

/** Workspaces the signed-in user belongs to (Better Auth organizations). */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspacesKey,
    queryFn: async () => {
      const { data, error } = await authClient.organization.list()
      if (error) throw new Error(error.message ?? "Couldn't load workspaces")
      return (data ?? []).map((o) => ({ id: o.id, slug: o.slug, name: o.name }))
    },
  })
}

/** Business profile of the active workspace (locale, timezone, currency). */
export function useWorkspaceProfile() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["workspace", ws, "profile"],
    queryFn: () => unwrap(api.GET("/v1/workspace")),
    enabled: Boolean(ws),
    staleTime: 5 * 60_000,
  })
}
