import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ProjectStatus, Task, TaskStatus } from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same keys as the web (`apps/web/features/projects/api/keys.ts`). */
export const projectKeys = {
  all: (ws: string | undefined) => ["projects", ws] as const,
  list: (
    ws: string | undefined,
    filters: { status?: ProjectStatus; clientId?: string; q?: string },
    pageSize: number
  ) => ["projects", ws, "list", filters, pageSize] as const,
  detail: (ws: string | undefined, id: string) =>
    ["projects", ws, "detail", id] as const,
  tasks: (ws: string | undefined, id: string) =>
    ["projects", ws, "tasks", id] as const,
}

/** Under "time", so starting, stopping or logging time refreshes it. */
const summaryKey = (ws: string | undefined, id: string) =>
  ["time", ws, "summary", id] as const

/**
 * Projects by name, filtered by status, client and `q` (no status: all,
 * archived included). The first 100.
 */
export function useProjects(
  filters: { q?: string; clientId?: string; status?: ProjectStatus },
  enabled = true
) {
  const ws = useWs()
  const f = {
    q: filters.q || undefined,
    clientId: filters.clientId,
    status: filters.status,
  }
  return useQuery({
    queryKey: projectKeys.list(ws, f, 100),
    queryFn: () =>
      unwrap(
        api.GET("/v1/projects", {
          params: {
            query: { ...f, sort: "name:asc", pageSize: 100 } as never,
          },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useProject(id: string) {
  const ws = useWs()
  return useQuery({
    queryKey: projectKeys.detail(ws, id),
    queryFn: () =>
      unwrap(api.GET("/v1/projects/{id}", { params: { path: { id } } })),
    enabled: Boolean(ws && id),
  })
}

/** Tracked, billable and unbilled time (and money, when hourly). */
export function useProjectTimeSummary(id: string, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: summaryKey(ws, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/projects/{id}/time-summary", { params: { path: { id } } })
      ),
    enabled: Boolean(ws && id) && enabled,
  })
}

/** A draft invoice for the project's billable, uninvoiced time. */
export function useInvoiceUnbilledTime() {
  const qc = useQueryClient()
  const ws = useWs()
  return useMutation({
    mutationFn: (projectId: string) =>
      unwrap(
        api.POST("/v1/invoices/from-time", {
          body: { projectId } as never,
        })
      ),
    onSuccess: () =>
      Promise.all(
        ["time", "invoices", "projects", "dashboard"].map((k) =>
          qc.invalidateQueries({ queryKey: [k, ws] })
        )
      ),
  })
}

/** The project's tasks, in board order (status, then position). */
export function useProjectTasks(projectId: string) {
  const ws = useWs()
  return useQuery({
    queryKey: projectKeys.tasks(ws, projectId),
    queryFn: () =>
      unwrap(
        api.GET("/v1/projects/{id}/tasks", {
          params: { path: { id: projectId } },
        })
      ),
    enabled: Boolean(ws && projectId),
  })
}

/**
 * Move a task to another column (it goes to the end, as on the web's
 * board). Shown at once; put back if the server says no. Needs
 * `project.update`.
 */
export function useSetTaskStatus(projectId: string) {
  const qc = useQueryClient()
  const ws = useWs()
  const key = projectKeys.tasks(ws, projectId)
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      unwrap(
        api.PATCH("/v1/projects/{id}/tasks/{taskId}", {
          params: { path: { id: projectId, taskId } },
          body: { status } as never,
        })
      ),
    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      if (prev)
        qc.setQueryData<Task[]>(
          key,
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status,
                  completedAt:
                    status === "done" ? new Date().toISOString() : null,
                }
              : t
          )
        )
      return { prev }
    },
    onError: (_e, _v, c) => {
      if (c?.prev) qc.setQueryData(key, c.prev)
    },
    // Task counts on the project and its rows.
    onSettled: () => qc.invalidateQueries({ queryKey: projectKeys.all(ws) }),
  })
}

/** Add a task to "To do" (needs `project.update`). */
export function useAddTask(projectId: string) {
  const qc = useQueryClient()
  const ws = useWs()
  return useMutation({
    mutationFn: (title: string) =>
      unwrap(
        api.POST("/v1/projects/{id}/tasks", {
          params: { path: { id: projectId } },
          body: { title } as never,
        })
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: projectKeys.all(ws) }),
  })
}
