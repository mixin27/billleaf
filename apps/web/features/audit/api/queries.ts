"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { AuditQuery } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

/** This workspace's audit log (Settings → Audit log). */
export function useWorkspaceAudit(q: AuditQuery) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["audit", ws, q],
    queryFn: () =>
      unwrap(api.GET("/v1/audit", { params: { query: q as never } })),
    enabled: Boolean(ws),
    placeholderData: keepPreviousData,
  })
}
