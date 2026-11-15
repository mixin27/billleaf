"use client"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { memberKeys } from "./keys"

export function useMembers() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: memberKeys.list(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/members")),
    enabled: Boolean(workspaceId),
  })
}

export function useInvitations(enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: memberKeys.invitations(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/invitations")),
    enabled: Boolean(workspaceId) && enabled,
  })
}
