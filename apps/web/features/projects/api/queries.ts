"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { projectKeys, type ProjectFilters } from "./keys"

export function useProjects(filters: ProjectFilters, pageSize = 25) {
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return useInfiniteQuery({
    queryKey: projectKeys.list(workspaceId, filters, pageSize),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/projects", {
          params: {
            query: {
              status: filters.status,
              clientId: filters.clientId,
              q: filters.q || undefined,
              limit: pageSize,
              cursor: pageParam ?? undefined,
            },
          },
        })
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(workspaceId),
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
