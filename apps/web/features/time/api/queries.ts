"use client"

import { useQuery } from "@tanstack/react-query"
import type { ListTimeEntriesQuery } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

export const timeKeys = {
  all: (ws: string | undefined) => ["time", ws] as const,
  running: (ws: string | undefined) => ["time", ws, "running"] as const,
  list: (ws: string | undefined, q: ListTimeEntriesQuery) =>
    ["time", ws, "list", q] as const,
  summary: (ws: string | undefined, projectId: string) =>
    ["time", ws, "summary", projectId] as const,
}

export function useRunningTimer(enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: timeKeys.running(ws),
    queryFn: async () =>
      (await unwrap(api.GET("/v1/time-entries/running"))).entry,
    enabled: Boolean(ws) && enabled,
    refetchOnWindowFocus: true,
  })
}

export function useTimeEntries(q: ListTimeEntriesQuery, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: timeKeys.list(ws, q),
    queryFn: () =>
      unwrap(api.GET("/v1/time-entries", { params: { query: q } })),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useProjectTimeSummary(projectId: string, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: timeKeys.summary(ws, projectId),
    queryFn: () =>
      unwrap(
        api.GET("/v1/projects/{id}/time-summary", {
          params: { path: { id: projectId } },
        })
      ),
    enabled: Boolean(ws) && enabled,
  })
}
