"use client"

import { useQuery } from "@tanstack/react-query"

import { api, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

import { useWorkspaceStore } from "../stores/workspace-store"
import { workspaceKeys } from "./keys"

/** Current user + effective permissions in the active workspace. */
export function useMe() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: workspaceKeys.me(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/me")),
    enabled: Boolean(workspaceId),
  })
}

/** Workspaces the signed-in user belongs to. */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async () => {
      const { data, error } = await authClient.organization.list()
      if (error) throw new Error(error.message ?? "Failed to load workspaces")
      return data
    },
  })
}

/** Business profile of the active workspace (name, address, document defaults). */
export function useWorkspaceProfile() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: workspaceKeys.profile(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/workspace")),
    enabled: Boolean(workspaceId),
  })
}
