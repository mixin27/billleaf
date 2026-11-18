import { addDays, weekStart } from "@workspace/contracts"
import { useQuery } from "@tanstack/react-query"

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

/** Your tracked and billable time this week (as the web's week card). */
export function useWeekTime(today: string | undefined) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  const from = today ? weekStart(today) : undefined
  return useQuery({
    queryKey: [
      "time",
      ws,
      "list",
      { from, to: from && addDays(from, 6), memberId: "me" },
    ],
    enabled: Boolean(ws && from),
    queryFn: () =>
      unwrap(
        api.GET("/v1/time-entries", {
          params: {
            query: { from: from!, to: addDays(from!, 6), memberId: "me" },
          },
        })
      ),
  })
}
