"use client"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

export function useDashboard() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["dashboard", workspaceId],
    queryFn: () => unwrap(api.GET("/v1/dashboard")),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  })
}
