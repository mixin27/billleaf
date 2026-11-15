"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { CheckoutInput, TestPortalAction } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

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
