"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreatePaymentAccountInput,
  PaymentAccount,
  UpdatePaymentAccountInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

export const paymentAccountKeys = {
  all: (ws: string | undefined) => ["payment-accounts", ws] as const,
}

export function usePaymentAccounts() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: paymentAccountKeys.all(ws),
    queryFn: async () => (await unwrap(api.GET("/v1/payment-accounts"))).items,
    enabled: Boolean(ws),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: paymentAccountKeys.all(ws) })
}

export function useSavePaymentAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: (CreatePaymentAccountInput | UpdatePaymentAccountInput) & {
      id?: string
    }) =>
      id
        ? unwrap(
            api.PATCH("/v1/payment-accounts/{id}", {
              params: { path: { id } },
              body: body as never,
            })
          )
        : unwrap(api.POST("/v1/payment-accounts", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useDeletePaymentAccount() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/payment-accounts/{id}", { params: { path: { id } } })
      ),
    onSuccess: invalidate,
  })
}

export function useReorderPaymentAccounts() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.PUT("/v1/payment-accounts/order", { body: { ids } })),
    onSuccess: invalidate,
  })
}

/** QR image upload (multipart: the typed client doesn't do it well). */
export function useUploadQr() {
  const invalidate = useInvalidate()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: async ({
      id,
      file,
    }: {
      id: string
      file: File
    }): Promise<PaymentAccount> => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/payment-accounts/${id}/qr`,
        {
          method: "PUT",
          body: form,
          credentials: "include",
          headers: ws ? { "x-workspace-id": ws } : {},
        }
      )
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      return body as PaymentAccount
    },
    onSuccess: invalidate,
  })
}

export function useRemoveQr() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/payment-accounts/{id}/qr", {
          params: { path: { id } },
        })
      ),
    onSuccess: invalidate,
  })
}
