"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  AdminAuditQuery,
  AdminBanInput,
  AdminJobsQuery,
  AdminSetPlanInput,
  AdminSubscriptionPaymentQuery,
  CreatePlatformPriceInput,
  UpdatePlatformPriceInput,
  AdminUserListQuery,
  AdminWorkspaceListQuery,
} from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

/** Platform admin portal data. Not workspace-scoped. */
export const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  workspaces: (q: AdminWorkspaceListQuery) =>
    ["admin", "workspaces", q] as const,
  workspace: (id: string) => ["admin", "workspace", id] as const,
  users: (q: AdminUserListQuery) => ["admin", "users", q] as const,
  user: (id: string) => ["admin", "user", id] as const,
  jobs: (q: AdminJobsQuery) => ["admin", "jobs", q] as const,
  audit: (q: AdminAuditQuery) => ["admin", "audit", q] as const,
  prices: ["admin", "prices"] as const,
  payments: (q: AdminSubscriptionPaymentQuery) =>
    ["admin", "subscription-payments", q] as const,
}

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: () => unwrap(api.GET("/v1/admin/overview")),
    retry: false,
  })
}

export function useAdminWorkspaces(q: AdminWorkspaceListQuery) {
  return useQuery({
    queryKey: adminKeys.workspaces(q),
    queryFn: () =>
      unwrap(
        api.GET("/v1/admin/workspaces", { params: { query: q as never } })
      ),
    placeholderData: keepPreviousData,
  })
}

export function useAdminWorkspace(id: string) {
  return useQuery({
    queryKey: adminKeys.workspace(id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/admin/workspaces/{id}", { params: { path: { id } } })
      ),
  })
}

export function useAdminUsers(q: AdminUserListQuery) {
  return useQuery({
    queryKey: adminKeys.users(q),
    queryFn: () =>
      unwrap(api.GET("/v1/admin/users", { params: { query: q as never } })),
    placeholderData: keepPreviousData,
  })
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () =>
      unwrap(api.GET("/v1/admin/users/{id}", { params: { path: { id } } })),
  })
}

export function useAdminJobs(q: AdminJobsQuery) {
  return useQuery({
    queryKey: adminKeys.jobs(q),
    queryFn: () =>
      unwrap(api.GET("/v1/admin/jobs", { params: { query: q as never } })),
    placeholderData: keepPreviousData,
  })
}

export function useAdminAudit(q: AdminAuditQuery) {
  return useQuery({
    queryKey: adminKeys.audit(q),
    queryFn: () =>
      unwrap(api.GET("/v1/admin/audit", { params: { query: q as never } })),
    placeholderData: keepPreviousData,
  })
}

function useAdminMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  })
}

export function useSetWorkspacePlan(id: string) {
  return useAdminMutation((body: AdminSetPlanInput) =>
    unwrap(
      api.PUT("/v1/admin/workspaces/{id}/plan", {
        params: { path: { id } },
        body: body as never,
      })
    )
  )
}

export function useBanUser(id: string) {
  return useAdminMutation((body: AdminBanInput) =>
    unwrap(
      api.POST("/v1/admin/users/{id}/ban", {
        params: { path: { id } },
        body: body as never,
      })
    )
  )
}

export function useUnbanUser(id: string) {
  return useAdminMutation((reason: string) =>
    unwrap(
      api.POST("/v1/admin/users/{id}/unban", {
        params: { path: { id } },
        body: { reason },
      })
    )
  )
}

export function useRevokeSessions(id: string) {
  return useAdminMutation((reason: string) =>
    unwrap(
      api.POST("/v1/admin/users/{id}/revoke-sessions", {
        params: { path: { id } },
        body: { reason },
      })
    )
  )
}

export function useResendVerification(id: string) {
  return useAdminMutation(() =>
    unwrap(
      api.POST("/v1/admin/users/{id}/resend-verification", {
        params: { path: { id } },
      })
    )
  )
}

/**
 * Record the reason with the API (audited, one-time permission), then let
 * Better Auth switch this browser to the user's session.
 */
export function useImpersonate(id: string) {
  return useMutation({
    mutationFn: async (reason: string) => {
      await unwrap(
        api.POST("/v1/admin/users/{id}/impersonation", {
          params: { path: { id } },
          body: { reason },
        })
      )
      const { error } = await authClient.admin.impersonateUser({ userId: id })
      if (error)
        throw new Error(error.message ?? "Couldn't sign in as the user")
    },
  })
}

export function useRetryJob() {
  return useAdminMutation(({ queue, id }: { queue: string; id: string }) =>
    unwrap(
      api.POST("/v1/admin/jobs/{queue}/{id}/retry", {
        params: { path: { queue, id } },
      })
    )
  )
}

export function useRemoveJob() {
  return useAdminMutation(({ queue, id }: { queue: string; id: string }) =>
    unwrap(
      api.DELETE("/v1/admin/jobs/{queue}/{id}", {
        params: { path: { queue, id } },
      })
    )
  )
}

// ── Manual billing ──────────────────────────────────────────

export function useAdminPrices() {
  return useQuery({
    queryKey: adminKeys.prices,
    queryFn: async () => (await unwrap(api.GET("/v1/admin/prices"))).items,
  })
}

export function useSavePrice() {
  return useAdminMutation(
    ({
      id,
      ...body
    }: (CreatePlatformPriceInput | UpdatePlatformPriceInput) & {
      id?: string
    }) =>
      id
        ? unwrap(
            api.PATCH("/v1/admin/prices/{id}", {
              params: { path: { id } },
              body: body as never,
            })
          )
        : unwrap(api.POST("/v1/admin/prices", { body: body as never }))
  )
}

export function useDeletePrice() {
  return useAdminMutation((id: string) =>
    unwrap(api.DELETE("/v1/admin/prices/{id}", { params: { path: { id } } }))
  )
}

export function useAdminSubscriptionPayments(q: AdminSubscriptionPaymentQuery) {
  return useQuery({
    queryKey: adminKeys.payments(q),
    queryFn: () =>
      unwrap(
        api.GET("/v1/admin/subscription-payments", {
          params: { query: q as never },
        })
      ),
    placeholderData: keepPreviousData,
  })
}

export function useApprovePayment() {
  return useAdminMutation(({ id, periods }: { id: string; periods?: number }) =>
    unwrap(
      api.POST("/v1/admin/subscription-payments/{id}/approve", {
        params: { path: { id } },
        body: periods ? { periods } : {},
      })
    )
  )
}

export function useRejectPayment() {
  return useAdminMutation(({ id, reason }: { id: string; reason: string }) =>
    unwrap(
      api.POST("/v1/admin/subscription-payments/{id}/reject", {
        params: { path: { id } },
        body: { reason },
      })
    )
  )
}
