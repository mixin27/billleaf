"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CheckoutInput,
  SubmitSubscriptionPaymentInput,
  SubscriptionPayment,
  TestPortalAction,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

import { billingKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  // Plan changes affect permissions-adjacent UI and limits everywhere.
  return () => qc.invalidateQueries({ queryKey: billingKeys.all(workspaceId) })
}

/** Starts hosted checkout and navigates to it. */
export function useCheckout() {
  return useMutation({
    mutationFn: (body: CheckoutInput) =>
      unwrap(api.POST("/v1/billing/checkout", { body })),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function useChangePlan() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CheckoutInput) =>
      unwrap(api.POST("/v1/billing/change-plan", { body })),
    onSuccess: invalidate,
  })
}

export function usePortal() {
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/billing/portal")),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function useTestCheckout() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (session: string) =>
      unwrap(api.POST("/v1/billing/test/checkout", { body: { session } })),
    onSuccess: invalidate,
  })
}

export function useTestPortalAction() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { session: string; action: TestPortalAction }) =>
      unwrap(api.POST("/v1/billing/test/portal", { body })),
    onSuccess: invalidate,
  })
}

/** Manual billing: upload proof of payment for a plan (multipart). */
export function useSubmitSubscriptionPayment() {
  const invalidate = useInvalidate()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: async ({
      file,
      ...fields
    }: SubmitSubscriptionPaymentInput & {
      file: File
    }): Promise<SubscriptionPayment> => {
      const form = new FormData()
      for (const [k, v] of Object.entries(fields))
        if (v !== undefined && v !== null && v !== "") form.append(k, String(v))
      form.append("file", file)
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/billing/manual/payments`,
        {
          method: "POST",
          body: form,
          credentials: "include",
          headers: ws ? { "x-workspace-id": ws } : {},
        }
      )
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      return body as SubscriptionPayment
    },
    onSuccess: invalidate,
  })
}
