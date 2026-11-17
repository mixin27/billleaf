"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreateTimeFavoriteInput,
  TimeFavorite,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { timeKeys } from "./queries"

const favoritesKey = (ws: string | undefined) =>
  [...timeKeys.all(ws), "favorites"] as const

/** Your pinned entries, in your order. */
export function useTimeFavorites(enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: favoritesKey(ws),
    queryFn: async () => (await unwrap(api.GET("/v1/time-favorites"))).items,
    enabled: Boolean(ws) && enabled,
    staleTime: 60_000,
  })
}

export function useCreateFavorite() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (body: CreateTimeFavoriteInput) =>
      unwrap(api.POST("/v1/time-favorites", { body: body as never })),
    onSuccess: () => qc.invalidateQueries({ queryKey: favoritesKey(ws) }),
  })
}

export function useDeleteFavorite() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/time-favorites/{id}", { params: { path: { id } } })
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: favoritesKey(ws) }),
  })
}

/** Reorder optimistically; the server's order wins when it answers. */
export function useReorderFavorites() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.PUT("/v1/time-favorites/order", { body: { ids } })),
    onMutate: (ids) => {
      const key = favoritesKey(ws)
      const prev = qc.getQueryData<TimeFavorite[]>(key)
      if (prev)
        qc.setQueryData(
          key,
          ids.flatMap((id) => prev.find((f) => f.id === id) ?? [])
        )
      return { prev }
    },
    onError: (_e, _ids, c) => {
      if (c?.prev) qc.setQueryData(favoritesKey(ws), c.prev)
    },
    onSuccess: (list) => qc.setQueryData(favoritesKey(ws), list.items),
  })
}

/** Start a timer from a favourite (stops the running one). */
export function useStartFavorite() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/time-favorites/{id}/start", { params: { path: { id } } })
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: timeKeys.all(ws) }),
        qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
      ]),
  })
}
