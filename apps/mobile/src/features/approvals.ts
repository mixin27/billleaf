import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ApprovalStatus } from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

/**
 * Timesheet approvals (Team plan, turned on in settings): approvers see the
 * weeks members submitted and approve them or send them back. Keys sit
 * under "time" like the web's, so a time refresh covers them.
 */
const approvalKeys = {
  list: (ws: string | undefined, status: ApprovalStatus | undefined) =>
    ["time", ws, "approvals", status ?? "all"] as const,
  one: (ws: string | undefined, id: string) =>
    ["time", ws, "approvals", "one", id] as const,
  week: (ws: string | undefined, week: string, memberId: string) =>
    ["time", ws, "timesheet", week, memberId] as const,
}

export const APPROVAL_FILTERS = [
  "submitted",
  "approved",
  "rejected",
  "all",
] as const
export type ApprovalFilter = (typeof APPROVAL_FILTERS)[number]

export const APPROVAL_FILTER_LABELS: Record<ApprovalFilter, string> = {
  submitted: "Waiting",
  approved: "Approved",
  rejected: "Sent back",
  all: "All",
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  submitted: "Waiting",
  approved: "Approved",
  rejected: "Sent back",
}

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

export function useTimesheetApprovals(filter: ApprovalFilter, enabled = true) {
  const ws = useWs()
  const status = filter === "all" ? undefined : filter
  return useQuery({
    queryKey: approvalKeys.list(ws, status),
    queryFn: () =>
      unwrap(
        api.GET("/v1/timesheet-approvals", {
          params: { query: status ? { status } : {} },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useTimesheetApproval(id: string) {
  const ws = useWs()
  return useQuery({
    queryKey: approvalKeys.one(ws, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/timesheet-approvals/{id}", {
          params: { path: { id } },
        })
      ),
    enabled: Boolean(ws && id),
  })
}

/** A member's week: hours per project and task, per day. */
export function useMemberWeek(
  week: string | undefined,
  memberId: string | undefined
) {
  const ws = useWs()
  return useQuery({
    queryKey: approvalKeys.week(ws, week ?? "", memberId ?? ""),
    queryFn: () =>
      unwrap(
        api.GET("/v1/time/timesheet", {
          params: { query: { week: week!, memberId: memberId! } },
        })
      ),
    enabled: Boolean(ws && week && memberId),
  })
}

/**
 * Approve a submitted week (note optional), or send it back / reopen an
 * approved one (note required). Approval changes locks and what can be
 * invoiced, so time, projects and the dashboard refresh.
 */
export function useReviewWeek(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      action,
      note,
    }: {
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
    onSuccess: () =>
      Promise.all(
        ["time", "projects", "dashboard"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] })
        )
      ),
  })
}
