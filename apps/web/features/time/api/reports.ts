"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  ClockifyImportResult,
  DetailedReportQuery,
  ReportFilters,
  SetTimesheetCellInput,
  SummaryReportQuery,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

import { timeKeys } from "./queries"

export function useTimesheet(week: string) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...timeKeys.all(ws), "timesheet", week],
    queryFn: () =>
      unwrap(api.GET("/v1/time/timesheet", { params: { query: { week } } })),
    enabled: Boolean(ws),
    placeholderData: keepPreviousData,
  })
}

export function useSetTimesheetCell() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (body: SetTimesheetCellInput) =>
      unwrap(api.PUT("/v1/time/timesheet/cell", { body: body as never })),
    onSuccess: (sheet) => {
      qc.setQueryData(
        [...timeKeys.all(ws), "timesheet", sheet.weekStart],
        sheet
      )
      void qc.invalidateQueries({
        queryKey: timeKeys.all(ws),
        predicate: (q) => q.queryKey[2] !== "timesheet",
      })
    },
  })
}

export function useSummaryReport(query: SummaryReportQuery, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...timeKeys.all(ws), "report", "summary", query],
    queryFn: () =>
      unwrap(
        api.GET("/v1/time/reports/summary", {
          params: { query: query as never },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: keepPreviousData,
  })
}

export function useDetailedReport(query: DetailedReportQuery, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...timeKeys.all(ws), "report", "detailed", query],
    queryFn: () =>
      unwrap(
        api.GET("/v1/time/reports/detailed", {
          params: { query: query as never },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: keepPreviousData,
  })
}

function rawHeaders(): Record<string, string> {
  const id = useWorkspaceStore.getState().workspace?.id
  return id ? { "x-workspace-id": id } : {}
}

function toSearch(q: Record<string, unknown>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue
    for (const x of [v].flat()) p.append(k, String(x))
  }
  return p.toString()
}

/** Download the detailed report as CSV (a raw call: the body isn't JSON). */
export async function downloadReportCsv(filters: ReportFilters) {
  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/v1/time/reports/detailed.csv?${toSearch(filters)}`,
    { credentials: "include", headers: rawHeaders() }
  )
  if (!res.ok)
    throw new ApiError(res.status, await res.json().catch(() => undefined))
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = `time-${filters.from}-to-${filters.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Upload a Clockify CSV (multipart: openapi-fetch doesn't do it well). */
export function useClockifyImport() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: async (v: {
      file: File
      dryRun: boolean
      dateFormat: "auto" | "MDY" | "DMY" | "YMD"
    }): Promise<ClockifyImportResult> => {
      const form = new FormData()
      form.append("file", v.file)
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/time/import/clockify?${toSearch({
          dryRun: v.dryRun ? "true" : "false",
          dateFormat: v.dateFormat,
        })}`,
        {
          method: "POST",
          body: form,
          credentials: "include",
          headers: rawHeaders(),
        }
      )
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      return body as ClockifyImportResult
    },
    onSuccess: (r) => {
      if (!r.dryRun) void qc.invalidateQueries({ queryKey: timeKeys.all(ws) })
    },
  })
}
