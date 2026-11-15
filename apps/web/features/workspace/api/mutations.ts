"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/lib/auth-client"

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
