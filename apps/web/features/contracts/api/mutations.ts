"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateContractInput,
  CreateContractTemplateInput,
  SendDocumentInput,
  SignContractInput,
  UpdateContractInput,
  UpdateContractTemplateInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { contractKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: contractKeys.all(workspaceId) })
}

const path = (id: string) => ({ params: { path: { id } } })

export function useCreateContract() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateContractInput) =>
      unwrap(api.POST("/v1/contracts", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateContractInput) =>
      unwrap(
        api.PATCH("/v1/contracts/{id}", { ...path(id), body: body as never })
      ),
    onSuccess: invalidate,
  })
}

export type ContractAction = "send" | "decline"

export function useContractAction(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (action: ContractAction) =>
      action === "send"
        ? unwrap(api.POST("/v1/contracts/{id}/send", path(id)))
        : unwrap(api.POST("/v1/contracts/{id}/decline", path(id))),
    onSuccess: invalidate,
  })
}

export function useSignContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SignContractInput) =>
      unwrap(
        api.POST("/v1/contracts/{id}/sign", {
          ...path(id),
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useVoidContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (reason: string) =>
      unwrap(
        api.POST("/v1/contracts/{id}/void", {
          ...path(id),
          body: { reason: reason || null },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useEmailContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/contracts/{id}/email", {
          ...path(id),
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.DELETE("/v1/contracts/{id}", path(id))),
    onSuccess: invalidate,
  })
}

export function useSaveContractTemplate(id?: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (
      body: CreateContractTemplateInput | UpdateContractTemplateInput
    ) =>
      id
        ? unwrap(
            api.PATCH("/v1/contract-templates/{id}", {
              ...path(id),
              body: body as never,
            })
          )
        : unwrap(api.POST("/v1/contract-templates", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useDeleteContractTemplate(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/v1/contract-templates/{id}", path(id))),
    onSuccess: invalidate,
  })
}
