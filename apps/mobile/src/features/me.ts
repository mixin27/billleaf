import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** You in the active workspace: permissions and plan (GET /v1/me). */
export function useMe() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["me", ws],
    queryFn: () => unwrap(api.GET("/v1/me")),
    enabled: Boolean(ws),
    staleTime: 5 * 60_000,
  })
}
