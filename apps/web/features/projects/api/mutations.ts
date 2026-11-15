"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CreateProjectInput,
  CreateTaskInput,
  Task,
  UpdateProjectInput,
  UpdateTaskInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { projectKeys } from "./keys"

function useInvalidate() {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: projectKeys.all(workspaceId) })
}

export function useCreateProject() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateProjectInput) =>
      unwrap(api.POST("/v1/projects", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateProjectInput) =>
      unwrap(
        api.PATCH("/v1/projects/{id}", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteProject(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/v1/projects/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useProjectFromQuote(quoteId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/v1/projects/from-quote/{quoteId}", {
          params: { path: { quoteId } },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useCreateTask(projectId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateTaskInput) =>
      unwrap(
        api.POST("/v1/projects/{id}/tasks", {
          params: { path: { id: projectId } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

/** Optimistic: the board updates instantly and rolls back on error. */
export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  const workspaceId = useWorkspaceStore((s) => s.workspace?.id)
  const key = projectKeys.tasks(workspaceId, projectId)
  return useMutation({
    mutationFn: ({ taskId, ...body }: UpdateTaskInput & { taskId: string }) =>
      unwrap(
        api.PATCH("/v1/projects/{id}/tasks/{taskId}", {
          params: { path: { id: projectId, taskId } },
          body: body as never,
        })
      ),
    onMutate: async ({ taskId, afterTaskId: _after, ...patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (tasks) =>
        tasks?.map((t) =>
          t.id === taskId ? { ...t, ...(patch as Partial<Task>) } : t
        )
      )
      return { previous }
    },
    onError: (_e, _v, ctx) =>
      ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: projectKeys.all(workspaceId) }),
  })
}

export function useDeleteTask(projectId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (taskId: string) =>
      unwrap(
        api.DELETE("/v1/projects/{id}/tasks/{taskId}", {
          params: { path: { id: projectId, taskId } },
        })
      ),
    onSuccess: invalidate,
  })
}
