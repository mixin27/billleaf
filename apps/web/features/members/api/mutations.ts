"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CreateInvitationInput } from "@workspace/contracts"

import { useWorkspaceStore, workspaceKeys } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { memberKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: memberKeys.all(workspaceId) }),
      qc.invalidateQueries({ queryKey: workspaceKeys.me(workspaceId) }),
    ])
}

export function useInviteMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateInvitationInput) =>
      unwrap(api.POST("/v1/invitations", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useResendInvitation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/invitations/{id}/resend", { params: { path: { id } } })
      ),
    onSuccess: invalidate,
  })
}

export function useCancelInvitation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/invitations/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useSetMemberRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) =>
      unwrap(
        api.PUT("/v1/members/{id}/roles", {
          params: { path: { id: memberId } },
          body: { roleIds: [roleId] },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.DELETE("/v1/members/{id}", { params: { path: { id: memberId } } })
      ),
    onSuccess: invalidate,
  })
}
