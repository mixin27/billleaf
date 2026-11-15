"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreatePaymentAccountInput,
  PaymentAccount,
  UpdatePaymentAccountInput,
} from "@workspace/contracts"
import * as React from "react"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

/**
 * Whose payment methods: the workspace's (shown to its clients) or
 * Billleaf's own (platform admins; shown on the subscription pay page).
 */
export type AccountsSource = "workspace" | "platform"
export const AccountsSourceContext =
  React.createContext<AccountsSource>("workspace")

export const paymentAccountKeys = {
  all: (ws: string | undefined) => ["payment-accounts", ws] as const,
  platform: ["admin", "payment-accounts"] as const,
}

function useSource() {
  const source = React.useContext(AccountsSourceContext)
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  const platform = source === "platform"
  return {
    platform,
    ws,
    key: platform ? paymentAccountKeys.platform : paymentAccountKeys.all(ws),
    base: platform ? "/v1/admin/payment-accounts" : "/v1/payment-accounts",
  }
}

export function usePaymentAccounts() {
  const { platform, ws, key } = useSource()
  return useQuery({
    queryKey: key,
    queryFn: async () =>
      (
        await (platform
          ? unwrap(api.GET("/v1/admin/payment-accounts"))
          : unwrap(api.GET("/v1/payment-accounts")))
      ).items,
    enabled: platform || Boolean(ws),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  const { key } = useSource()
  return () => qc.invalidateQueries({ queryKey: key })
}

export function useSavePaymentAccount() {
  const invalidate = useInvalidate()
  const { platform } = useSource()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: (CreatePaymentAccountInput | UpdatePaymentAccountInput) & {
      id?: string
    }) => {
      const opts = { params: { path: { id: id! } }, body: body as never }
      if (platform)
        return id
          ? unwrap(api.PATCH("/v1/admin/payment-accounts/{id}", opts))
          : unwrap(
              api.POST("/v1/admin/payment-accounts", { body: body as never })
            )
      return id
        ? unwrap(api.PATCH("/v1/payment-accounts/{id}", opts))
        : unwrap(api.POST("/v1/payment-accounts", { body: body as never }))
    },
    onSuccess: invalidate,
  })
}

export function useDeletePaymentAccount() {
  const invalidate = useInvalidate()
  const { platform } = useSource()
  return useMutation({
    mutationFn: (id: string) => {
      const opts = { params: { path: { id } } }
      return platform
        ? unwrap(api.DELETE("/v1/admin/payment-accounts/{id}", opts))
        : unwrap(api.DELETE("/v1/payment-accounts/{id}", opts))
    },
    onSuccess: invalidate,
  })
}

export function useReorderPaymentAccounts() {
  const invalidate = useInvalidate()
  const { platform } = useSource()
  return useMutation({
    mutationFn: (ids: string[]) =>
      platform
        ? unwrap(api.PUT("/v1/admin/payment-accounts/order", { body: { ids } }))
        : unwrap(api.PUT("/v1/payment-accounts/order", { body: { ids } })),
    onSuccess: invalidate,
  })
}

/** QR image upload (multipart: the typed client doesn't do it well). */
export function useUploadQr() {
  const invalidate = useInvalidate()
  const { platform, ws, base } = useSource()
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
      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${base}/${id}/qr`, {
        method: "PUT",
        body: form,
        credentials: "include",
        headers: ws && !platform ? { "x-workspace-id": ws } : {},
      })
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      return body as PaymentAccount
    },
    onSuccess: invalidate,
  })
}

export function useRemoveQr() {
  const invalidate = useInvalidate()
  const { platform } = useSource()
  return useMutation({
    mutationFn: (id: string) => {
      const opts = { params: { path: { id } } }
      return platform
        ? unwrap(api.DELETE("/v1/admin/payment-accounts/{id}/qr", opts))
        : unwrap(api.DELETE("/v1/payment-accounts/{id}/qr", opts))
    },
    onSuccess: invalidate,
  })
}
