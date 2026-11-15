"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateRoleInput, UpdateRoleInput } from "@workspace/contracts"

import { useWorkspaceStore, workspaceKeys } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { roleKeys } from "./keys"

function useInvalidateRoles() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: roleKeys.all(workspaceId) }),
      // Permissions of the current user may have changed.
      qc.invalidateQueries({ queryKey: workspaceKeys.me(workspaceId) }),
    ])
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: (body: CreateRoleInput) =>
      unwrap(api.POST("/v1/roles", { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateRoleInput & { id: string }) =>
      unwrap(api.PATCH("/v1/roles/{id}", { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/roles/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}
