import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  Contract,
  ContractStatus,
  SendDocumentInput,
} from "@workspace/contracts"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"

import { api, apiHeaders, unwrap } from "@/lib/api"
import { API_URL } from "@/lib/config"
export { CONTRACT_STATUS_LABELS, contractTone } from "@/lib/contract-status"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same prefix as the web (`apps/web/features/contracts/api/keys.ts`). */
export const contractKeys = {
  all: (ws: string | undefined) => ["contracts", ws] as const,
  list: (
    ws: string | undefined,
    filters: { status?: ContractStatus; clientId?: string }
  ) => ["contracts", ws, "list", filters] as const,
  detail: (ws: string | undefined, id: string) =>
    ["contracts", ws, "detail", id] as const,
}

export type ContractFilter = "sent" | "draft" | "signed" | "all"

export const CONTRACT_FILTERS: { value: ContractFilter; label: string }[] = [
  { value: "sent", label: "Waiting" },
  { value: "draft", label: "Drafts" },
  { value: "signed", label: "Signed" },
  { value: "all", label: "All" },
]

/** Contracts for a filter, newest first: the latest 50 (a client's: 100). */
export function useContracts(
  filter: ContractFilter,
  clientId?: string,
  enabled = true
) {
  const ws = useWs()
  const status = filter === "all" ? undefined : filter
  return useQuery({
    queryKey: contractKeys.list(ws, { status, clientId }),
    queryFn: () =>
      unwrap(
        api.GET("/v1/contracts", {
          params: {
            query: {
              status,
              clientId,
              sort: "createdAt:desc",
              pageSize: clientId ? 100 : 50,
            } as never,
          },
        })
      ),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useContract(id: string) {
  const ws = useWs()
  return useQuery({
    queryKey: contractKeys.detail(ws, id),
    queryFn: () =>
      unwrap(api.GET("/v1/contracts/{id}", { params: { path: { id } } })),
    enabled: Boolean(ws && id),
  })
}

/** Contracts, clients (their history) and the dashboard. */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWs()
  return () =>
    Promise.all(
      ["contracts", "clients", "dashboard"].map((k) =>
        qc.invalidateQueries({ queryKey: [k, ws] })
      )
    )
}

export type ContractStep =
  { step: "send" } | { step: "decline" } | { step: "void"; reason?: string }

/**
 * Mark a draft as sent (it gets its number and its text is frozen), record
 * that the client declined, or void a sent or signed contract.
 */
export function useContractStep(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (s: ContractStep) => {
      const params = { params: { path: { id } } }
      return unwrap(
        s.step === "send"
          ? api.POST("/v1/contracts/{id}/send", params)
          : s.step === "decline"
            ? api.POST("/v1/contracts/{id}/decline", params)
            : api.POST("/v1/contracts/{id}/void", {
                ...params,
                body: { reason: s.reason } as never,
              })
      )
    },
    onSettled: () => invalidate(),
  })
}

/** Record a signature you got outside the client portal. */
export function useSignContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: { signedByName: string; signedAt?: string }) =>
      unwrap(
        api.POST("/v1/contracts/{id}/sign", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSettled: () => invalidate(),
  })
}

/** Email a sent or signed contract, PDF attached, with a link to sign. */
export function useEmailContract(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: SendDocumentInput) =>
      unwrap(
        api.POST("/v1/contracts/{id}/email", {
          params: { path: { id } },
          body: body as never,
        })
      ),
    onSettled: () => invalidate(),
  })
}

/** Download the PDF (it needs your session) and open the share sheet. */
export async function shareContractPdf(contract: Contract) {
  const name = `${contract.number ?? "Draft contract"}.pdf`
  const file = await File.downloadFileAsync(
    `${API_URL}/v1/contracts/${contract.id}/pdf`,
    new File(Paths.cache, name),
    { headers: await apiHeaders(), idempotent: true }
  )
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: name,
  })
}
