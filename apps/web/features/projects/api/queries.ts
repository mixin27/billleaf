"use client"

import type { ListProjectsQuery } from "@workspace/contracts"

import { useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { projectKeys, type ProjectFilters } from "./keys"

/**
 * One page of the list (server-side paging, sorting and filters). Pickers
 * pass `pageSize: 100`.
 */
export function useProjects(query: ListProjectsQuery, enabled = true) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...projectKeys.all(workspaceId), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/projects", { params: { query: query as never } })),
    enabled: Boolean(workspaceId) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useProject(id: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: projectKeys.detail(workspaceId, id),
    queryFn: () =>
      unwrap(api.GET("/v1/projects/{id}", { params: { path: { id } } })),
    enabled: Boolean(workspaceId),
  })
}

export function useTasks(projectId: string) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: projectKeys.tasks(workspaceId, projectId),
    queryFn: () =>
      unwrap(
        api.GET("/v1/projects/{id}/tasks", {
          params: { path: { id: projectId } },
        })
      ),
    enabled: Boolean(workspaceId) && Boolean(projectId),
  })
}
