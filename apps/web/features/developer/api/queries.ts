"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CreateApiKeyInput } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

export const apiKeyKeys = {
  all: (ws: string | undefined) => ["api-keys", ws] as const,
}

export function useApiKeys() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: apiKeyKeys.all(ws),
    queryFn: () => unwrap(api.GET("/v1/api-keys")),
    enabled: Boolean(ws),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (body: CreateApiKeyInput) =>
      unwrap(api.POST("/v1/api-keys", { body: body as never })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.all(ws) }),
  })
}

export function useRevokeApiKey() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/api-keys/{id}", { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: apiKeyKeys.all(ws) }),
  })
}
