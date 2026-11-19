import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ClientDetail } from "@workspace/contracts"

import { api, unwrap } from "@/lib/api"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same keys as the web (`apps/web/features/clients/api/keys.ts`). */
export const clientKeys = {
  all: (ws: string | undefined) => ["clients", ws] as const,
  detail: (ws: string | undefined, id: string) =>
    ["clients", ws, "detail", id] as const,
}

/**
 * Active clients by name, filtered by `q` (name or email). The first 100;
 * a search finds the rest.
 */
export function useClients(q: string, enabled = true) {
  const ws = useWs()
  const query = { q: q || undefined, sort: "name:asc", pageSize: 100 }
  return useQuery({
    queryKey: [...clientKeys.all(ws), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/clients", { params: { query: query as never } })),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

/** A client with its contacts (needs client.read). */
export function useClient(id: string | undefined, enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: clientKeys.detail(ws, id ?? ""),
    queryFn: () =>
      unwrap(api.GET("/v1/clients/{id}", { params: { path: { id: id! } } })),
    enabled: Boolean(ws && id) && enabled,
    staleTime: 60_000,
  })
}

/**
 * Where documents go when you don't pick, as the API chooses: the primary
 * contact's email, else the client's, else any contact's.
 */
export function defaultRecipient(client: ClientDetail | undefined) {
  return (
    client?.contacts.find((c) => c.isPrimary && c.email)?.email ??
    client?.email ??
    client?.contacts.find((c) => c.email)?.email ??
    null
  )
}

/** Save an email address on the client (needs client.update). */
export function useSetClientEmail(id: string) {
  const qc = useQueryClient()
  const ws = useWs()
  return useMutation({
    mutationFn: (email: string) =>
      unwrap(
        api.PATCH("/v1/clients/{id}", {
          params: { path: { id } },
          body: { email } as never,
        })
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: clientKeys.all(ws) }),
  })
}
