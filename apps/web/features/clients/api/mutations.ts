"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateClientContactInput,
  CreateClientInput,
  UpdateClientContactInput,
  UpdateClientInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { clientKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: clientKeys.all(workspaceId) })
}

const path = (id: string) => ({ params: { path: { id } } })

export function useCreateClient() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateClientInput) =>
      unwrap(api.POST("/v1/clients", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateClient(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateClientInput) =>
      unwrap(
        api.PATCH("/v1/clients/{id}", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

export function useArchiveClient(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (archive: boolean) =>
      archive
        ? unwrap(api.POST("/v1/clients/{id}/archive", path(id)))
        : unwrap(api.POST("/v1/clients/{id}/restore", path(id))),
    onSuccess: invalidate,
  })
}

export function useDeleteClient(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/clients/{id}", path(id))),
    onSuccess: invalidate,
  })
}

export function useSaveContact(clientId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      contactId,
      ...body
    }: (CreateClientContactInput | UpdateClientContactInput) & {
      contactId?: string
    }) =>
      contactId
        ? unwrap(
            api.PATCH("/v1/clients/{id}/contacts/{contactId}", {
              params: { path: { id: clientId, contactId } },
              body: body as never,
            })
          )
        : unwrap(
            api.POST("/v1/clients/{id}/contacts", {
              ...path(clientId),
              body: body as never,
            })
          ),
    onSuccess: invalidate,
  })
}

export function useDeleteContact(clientId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (contactId: string) =>
      unwrap(
        api.DELETE("/v1/clients/{id}/contacts/{contactId}", {
          params: { path: { id: clientId, contactId } },
        })
      ),
    onSuccess: invalidate,
  })
}
