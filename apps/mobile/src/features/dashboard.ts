import { useQueries, useQuery } from "@tanstack/react-query"
import type { Cashbook } from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

/** GET /v1/dashboard (sections are null without permission), same key as web. */
export function useDashboard() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["dashboard", ws],
    queryFn: () => unwrap(api.GET("/v1/dashboard")),
    enabled: Boolean(ws),
    staleTime: 60_000,
  })
}

/**
 * Your own time for a range (GET /v1/time/reports/summary, memberId=me):
 * totals, seconds per day and the top projects. Owners see only their
 * own time here too.
 */
export function useMyTimeSummary(
  range: { from: string; to: string } | undefined,
  enabled = true
) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: ["time", ws, "summary", "me", range],
    enabled: Boolean(ws && range) && enabled,
    placeholderData: (prev) => prev,
    queryFn: () =>
      unwrap(
        api.GET("/v1/time/reports/summary", {
          params: {
            query: {
              from: range!.from,
              to: range!.to,
              memberId: "me",
              groupBy: "project",
            },
          },
        })
      ),
  })
}

/**
 * This month's cash in and out across your books, per currency (one report
 * per book; the ten most recently used).
 */
export function useBooksMonth(
  books: Cashbook[] | undefined,
  today: string | undefined
) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  const from = today ? `${today.slice(0, 7)}-01` : undefined
  const list = (books ?? []).slice(0, 10)
  const results = useQueries({
    queries: list.map((b) => ({
      queryKey: ["cashbooks", ws, "book", b.id, "report", { from, to: today }],
      enabled: Boolean(ws && from && today),
      queryFn: () =>
        unwrap(
          api.GET("/v1/cashbooks/{bookId}/report", {
            params: { path: { bookId: b.id }, query: { from, to: today } },
          })
        ),
    })),
  })
  const byCurrency = new Map<string, { totalIn: number; totalOut: number }>()
  results.forEach((r, i) => {
    if (!r.data) return
    const c = list[i]!.currency
    const cur = byCurrency.get(c) ?? { totalIn: 0, totalOut: 0 }
    cur.totalIn += r.data.totalIn
    cur.totalOut += r.data.totalOut
    byCurrency.set(c, cur)
  })
  return {
    byCurrency,
    loading: results.some((r) => r.isPending && r.fetchStatus !== "idle"),
  }
}
