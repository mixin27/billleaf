"use client"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { roleKeys } from "./keys"

export function useRoles() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: roleKeys.list(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/roles")),
    enabled: Boolean(workspaceId),
  })
}

export function usePermissionCatalog() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: roleKeys.catalog(),
    queryFn: () => unwrap(api.GET("/v1/permissions")),
    enabled: Boolean(workspaceId),
    staleTime: Infinity,
  })
}
