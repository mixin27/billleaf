"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { UpdateWorkspaceProfileInput } from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

import { useWorkspaceStore } from "../stores/workspace-store"

import { workspaceKeys } from "./keys"

export function useCreateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; slug: string }) => {
      const { data, error } = await authClient.organization.create(input)
      if (error) throw new Error(error.message ?? "Could not create workspace")
      await authClient.organization.setActive({ organizationId: data.id })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  })
}

export function useUpdateWorkspaceProfile() {
  const qc = useQueryClient()
  const { workspace, setWorkspace } = useWorkspaceStore()
  return useMutation({
    mutationFn: (body: UpdateWorkspaceProfileInput) =>
      unwrap(api.PATCH("/v1/workspace", { body: body as never })),
    onSuccess: (profile) => {
      qc.setQueryData(workspaceKeys.profile(profile.workspaceId), profile)
      if (workspace && workspace.name !== profile.name) {
        setWorkspace({ ...workspace, name: profile.name })
      }
      return qc.invalidateQueries({ queryKey: workspaceKeys.list() })
    },
  })
}
