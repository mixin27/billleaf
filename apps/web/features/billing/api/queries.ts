"use client"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { billingKeys } from "./keys"

export function useBillingOverview() {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: billingKeys.overview(workspaceId),
    queryFn: () => unwrap(api.GET("/v1/billing")),
    enabled: Boolean(workspaceId),
  })
}

export function useTestBillingSession(session: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: billingKeys.testSession(workspaceId, session),
    queryFn: () =>
      unwrap(
        api.GET("/v1/billing/test/session", {
          params: { query: { session } },
        })
      ),
    enabled: Boolean(workspaceId && session),
    retry: false,
  })
}
