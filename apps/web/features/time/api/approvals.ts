"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type { ListTimesheetApprovalsQuery } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, unwrap } from "@/lib/api"

import { timeKeys } from "./queries"

const approvalKeys = {
  list: (ws: string | undefined, q: ListTimesheetApprovalsQuery) =>
    [...timeKeys.all(ws), "approvals", q] as const,
}

/** Submitted weeks (approvers: everyone's; others: their own). */
export function useTimesheetApprovals(
  q: ListTimesheetApprovalsQuery = {},
  enabled = true
) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: approvalKeys.list(ws, q),
    queryFn: () =>
      unwrap(api.GET("/v1/timesheet-approvals", { params: { query: q } })),
    enabled: Boolean(ws) && enabled,
    placeholderData: keepPreviousData,
  })
}

/** Approval changes touch locks, totals and invoiceable time: refresh time. */
function useInvalidateTime() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: timeKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["projects", ws] }),
    ])
}

export function useSubmitWeek() {
  const invalidate = useInvalidateTime()
  return useMutation({
    mutationFn: (week: string) =>
      unwrap(api.POST("/v1/timesheet-approvals/submit", { body: { week } })),
    onSuccess: invalidate,
  })
}

export function useWithdrawWeek() {
  const invalidate = useInvalidateTime()
  return useMutation({
    mutationFn: (week: string) =>
      unwrap(api.POST("/v1/timesheet-approvals/withdraw", { body: { week } })),
    onSuccess: invalidate,
  })
}

export function useReviewWeek() {
  const invalidate = useInvalidateTime()
  return useMutation({
    mutationFn: ({
      id,
      action,
      note,
    }: {
      id: string
      action: "approve" | "reject"
      note?: string
    }) =>
      action === "approve"
        ? unwrap(
            api.POST("/v1/timesheet-approvals/{id}/approve", {
              params: { path: { id } },
              body: { note },
            })
          )
        : unwrap(
            api.POST("/v1/timesheet-approvals/{id}/reject", {
              params: { path: { id } },
              body: { note: note ?? "" },
            })
          ),
    onSuccess: invalidate,
  })
}
