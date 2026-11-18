import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  ListTimeEntriesQuery,
  StartTimerInput,
  TimeEntry,
  UpdateRunningInput,
} from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** Same key shape as the web (`apps/web/features/time/api/queries.ts`). */
export const timeKeys = {
  all: (ws: string | undefined) => ["time", ws] as const,
  running: (ws: string | undefined) => ["time", ws, "running"] as const,
  list: (ws: string | undefined, q: ListTimeEntriesQuery) =>
    ["time", ws, "list", q] as const,
  suggestions: (ws: string | undefined, q: string) =>
    ["time", ws, "suggestions", q] as const,
  favorites: (ws: string | undefined) => ["time", ws, "favorites"] as const,
}

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

export function useRunningTimer(enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: timeKeys.running(ws),
    queryFn: async () =>
      (await unwrap(api.GET("/v1/time-entries/running"))).entry,
    enabled: Boolean(ws) && enabled,
    refetchOnWindowFocus: true,
  })
}

export function useTimeEntries(q: ListTimeEntriesQuery, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: timeKeys.list(ws, q),
    queryFn: () =>
      unwrap(api.GET("/v1/time-entries", { params: { query: q } })),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

/** Recent description + project combos. */
export function useTimeSuggestions(q: string, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: timeKeys.suggestions(ws, q),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/time-entries/suggestions", {
            params: { query: q ? { q } : {} },
          })
        )
      ).items,
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

/** Active projects to track against (first page, by name). */
export function useActiveProjects(q: string, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: ["projects", ws, "active", q],
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/projects", {
            params: {
              query: {
                status: "active",
                sort: "name:asc",
                pageSize: 50,
                ...(q ? { q } : {}),
              },
            },
          })
        )
      ).items,
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
}

export function useTimeFavorites(enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: timeKeys.favorites(ws),
    queryFn: async () => (await unwrap(api.GET("/v1/time-favorites"))).items,
    enabled: Boolean(ws) && enabled,
    staleTime: 60_000,
  })
}

/** Time changes also move the dashboard and invoices (as on the web). */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWs()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: timeKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["invoices", ws] }),
      qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
    ])
}

export function useStartTimer() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: StartTimerInput) =>
      unwrap(api.POST("/v1/time-entries/start", { body: body as never })),
    onSuccess: invalidate,
  })
}

/** Stop, clearing the timer at once (put back if the server says no). */
export function useStopTimer() {
  const qc = useQueryClient()
  const ws = useWs()
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/time-entries/stop")),
    onMutate: async () => {
      const key = timeKeys.running(ws)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<TimeEntry | null>(key)
      qc.setQueryData(key, null)
      return { prev }
    },
    onError: (_e, _v, c) => {
      if (c?.prev !== undefined) qc.setQueryData(timeKeys.running(ws), c.prev)
    },
    onSettled: invalidate,
  })
}

export function useUpdateRunning() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateRunningInput) =>
      unwrap(api.PATCH("/v1/time-entries/running", { body: body as never })),
    onSuccess: invalidate,
  })
}

/** A new timer with the same description, project, task, tags and billable. */
export function useContinueEntry() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/time-entries/{id}/continue", { params: { path: { id } } })
      ),
    onSuccess: invalidate,
  })
}

/** Start a timer from a favourite (stops the running one). */
export function useStartFavorite() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/time-favorites/{id}/start", { params: { path: { id } } })
      ),
    onSuccess: invalidate,
  })
}

/** Who may track time here: the plan has it and the role allows it. */
export function canTrackTime(
  me:
    | { permissions: string[]; plan: { features: { timeTracking: boolean } } }
    | undefined
) {
  return Boolean(
    me?.plan.features.timeTracking &&
    (me.permissions.includes("time.track") ||
      me.permissions.includes("time.manage"))
  )
}
