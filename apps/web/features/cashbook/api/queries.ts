"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Cashbook, CashbookFilter } from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

import { cashbookKeys, type OptionKind } from "./keys"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

export function useCashbooks(archived = false) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.list(ws, archived),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/cashbooks", {
            params: { query: { archived: archived ? "true" : "false" } },
          })
        )
      ).items,
    enabled: Boolean(ws),
  })
}

export function useCashbook(id: string) {
  const ws = useWs()
  const qc = useQueryClient()
  return useQuery({
    queryKey: cashbookKeys.book(ws, id),
    queryFn: () =>
      unwrap(
        api.GET("/v1/cashbooks/{bookId}", { params: { path: { bookId: id } } })
      ),
    enabled: Boolean(ws && id),
    // Open instantly from the list while the fresh copy loads.
    placeholderData: () =>
      qc
        .getQueryData<Cashbook[]>(cashbookKeys.list(ws, false))
        ?.find((b) => b.id === id),
  })
}

/** One page of entries (newest first) with totals for the filters. */
export function useCashbookEntries(
  bookId: string,
  query: CashbookFilter & { page: number; pageSize: number }
) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.entries(ws, bookId, query),
    queryFn: () =>
      unwrap(
        api.GET("/v1/cashbooks/{bookId}/entries", {
          params: { path: { bookId }, query },
        })
      ),
    enabled: Boolean(ws && bookId),
    placeholderData: (prev) => prev,
  })
}

export function useEntryActivity(bookId: string, entryId: string | undefined) {
  const ws = useWs()
  return useQuery({
    queryKey: [...cashbookKeys.entry(ws, bookId, entryId ?? ""), "activity"],
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/cashbooks/{bookId}/entries/{id}/activity", {
            params: { path: { bookId, id: entryId! } },
          })
        )
      ).items,
    enabled: Boolean(ws && bookId && entryId),
  })
}

export function useCashbookOptions(bookId: string, kind: OptionKind) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.options(ws, bookId, kind),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/cashbooks/{bookId}/{kind}", {
            params: { path: { bookId, kind } },
          })
        )
      ).items,
    enabled: Boolean(ws && bookId),
    staleTime: 60_000,
  })
}

export function useCashbookMembers(bookId: string) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.members(ws, bookId),
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/cashbooks/{bookId}/members", {
            params: { path: { bookId } },
          })
        )
      ).items,
    enabled: Boolean(ws && bookId),
  })
}

export function useCashbookReport(bookId: string, filter: CashbookFilter) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.report(ws, bookId, filter),
    queryFn: () =>
      unwrap(
        api.GET("/v1/cashbooks/{bookId}/report", {
          params: { path: { bookId }, query: filter },
        })
      ),
    enabled: Boolean(ws && bookId),
  })
}

/**
 * Download the CSV or PDF statement for the filters (raw calls: the body
 * isn't JSON).
 */
export async function downloadCashbookFile(
  book: Cashbook,
  filter: CashbookFilter,
  kind: "csv" | "pdf"
) {
  const ws = useWorkspaceStore.getState().workspace?.id
  const query = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1]))
  ).toString()
  const path = kind === "pdf" ? "statement.pdf" : "export.csv"
  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/v1/cashbooks/${book.id}/${path}${query ? `?${query}` : ""}`,
    { credentials: "include", headers: ws ? { "x-workspace-id": ws } : {} }
  )
  if (!res.ok)
    throw new ApiError(res.status, await res.json().catch(() => undefined))
  const range =
    filter.from || filter.to ? ` ${filter.from ?? ""}–${filter.to ?? ""}` : ""
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = `${book.name}${range}.${kind}`.replace(/[/\\?%*:|"<>]/g, "-")
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
