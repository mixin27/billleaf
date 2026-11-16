"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  BulkUpdateTimeEntriesInput,
  CreateTagInput,
  CreateTimeEntryInput,
  StartTimerInput,
  UpdateRunningInput,
  UpdateTagInput,
  UpdateTimeEntryInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { timeKeys } from "./queries"

function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
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

export function useStopTimer() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => unwrap(api.POST("/v1/time-entries/stop")),
    onSuccess: invalidate,
  })
}

export function useSaveTimeEntry() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: (CreateTimeEntryInput | UpdateTimeEntryInput) & { id?: string }) =>
      id
        ? unwrap(
            api.PATCH("/v1/time-entries/{id}", {
              params: { path: { id } },
              body: body as never,
            })
          )
        : unwrap(api.POST("/v1/time-entries", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useDeleteTimeEntry() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/time-entries/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useInvoiceFromTime() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (projectId: string) =>
      unwrap(api.POST("/v1/invoices/from-time", { body: { projectId } })),
    onSuccess: invalidate,
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

export function useDuplicateEntry() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST("/v1/time-entries/{id}/duplicate", {
          params: { path: { id } },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useBulkUpdateEntries() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: BulkUpdateTimeEntriesInput) =>
      unwrap(api.PATCH("/v1/time-entries/bulk", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useBulkDeleteEntries() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.POST("/v1/time-entries/bulk-delete", { body: { ids } })),
    onSuccess: invalidate,
  })
}

export function useCreateTag() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateTagInput) =>
      unwrap(api.POST("/v1/tags", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateTag() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTagInput & { id: string }) =>
      unwrap(
        api.PATCH("/v1/tags/{id}", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteTag() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/tags/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

/** Rates price all time, so a change refreshes time, projects and reports. */
function useInvalidateRates() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["rates", ws] }),
      qc.invalidateQueries({ queryKey: timeKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["projects", ws] }),
    ])
}

export function useSetDefaultRate() {
  const invalidate = useInvalidateRates()
  return useMutation({
    mutationFn: (hourlyRate: number | null) =>
      unwrap(api.PUT("/v1/rates/default", { body: { hourlyRate } })),
    onSuccess: invalidate,
  })
}

export function useSetMemberRate() {
  const invalidate = useInvalidateRates()
  return useMutation({
    mutationFn: ({
      memberId,
      ...body
    }: {
      memberId: string
      hourlyRate: number | null
      costRate: number | null
    }) =>
      unwrap(
        api.PUT("/v1/rates/members/{memberId}", {
          params: { path: { memberId } },
          body,
        })
      ),
    onSuccess: invalidate,
  })
}
