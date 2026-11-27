"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type {
  CashbookEntry,
  CashbookRole,
  CreateCashbookEntryInput,
  CreateCashbookInput,
  UpdateCashbookEntryInput,
  UpdateCashbookInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

import { cashbookKeys, type OptionKind } from "./keys"

/** Everything cashbook-related: balances move with almost any change. */
function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () => qc.invalidateQueries({ queryKey: cashbookKeys.all(ws) })
}

export function useCreateCashbook() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: CreateCashbookInput) =>
      unwrap(api.POST("/v1/cashbooks", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useUpdateCashbook(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: UpdateCashbookInput) =>
      unwrap(
        api.PATCH("/v1/cashbooks/{bookId}", {
          params: { path: { bookId: id } },
          body: body as never,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteCashbook(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}", {
          params: { path: { bookId: id } },
        })
      ),
    onSuccess: invalidate,
  })
}

async function uploadAttachment(
  ws: string | undefined,
  bookId: string,
  entryId: string,
  file: File
): Promise<CashbookEntry> {
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/v1/cashbooks/${bookId}/entries/${entryId}/attachments`,
    {
      method: "POST",
      body: form,
      credentials: "include",
      headers: ws ? { "x-workspace-id": ws } : {},
    }
  )
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) throw new ApiError(res.status, body as never)
  return body as CashbookEntry
}

export type SavedEntry = {
  entry: CashbookEntry
  /** Saved, but a file didn't upload (say why). */
  attachmentError: unknown
}

/**
 * Add or change an entry, then upload new files. A failed upload keeps the
 * entry: the amount is what matters.
 */
export function useSaveEntry(bookId: string) {
  const invalidate = useInvalidate()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: async ({
      id,
      body,
      files,
    }: {
      id?: string
      body: CreateCashbookEntryInput | UpdateCashbookEntryInput
      files: File[]
    }): Promise<SavedEntry> => {
      let entry = id
        ? await unwrap(
            api.PATCH("/v1/cashbooks/{bookId}/entries/{id}", {
              params: { path: { bookId, id } },
              body: body as never,
            })
          )
        : await unwrap(
            api.POST("/v1/cashbooks/{bookId}/entries", {
              params: { path: { bookId } },
              body: body as never,
            })
          )
      try {
        for (const f of files)
          entry = await uploadAttachment(ws, bookId, entry.id, f)
        return { entry, attachmentError: null }
      } catch (attachmentError) {
        return { entry, attachmentError }
      }
    },
    onSettled: invalidate,
  })
}

export function useRemoveAttachment(bookId: string, entryId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (fileId: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/entries/{id}/attachments/{fileId}", {
          params: { path: { bookId, id: entryId, fileId } },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteEntries(bookId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (entryIds: string[]) =>
      unwrap(
        api.POST("/v1/cashbooks/{bookId}/entries/delete", {
          params: { path: { bookId } },
          body: { entryIds },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useTransferEntries(bookId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: {
      entryIds: string[]
      toBookId: string
      mode: "move" | "copy"
    }) =>
      unwrap(
        api.POST("/v1/cashbooks/{bookId}/entries/transfer", {
          params: { path: { bookId } },
          body,
        })
      ),
    onSuccess: invalidate,
  })
}

export function useSaveOption(bookId: string, kind: OptionKind) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      name,
      archived,
    }: {
      id?: string
      name?: string
      archived?: boolean
    }) =>
      id
        ? unwrap(
            api.PATCH("/v1/cashbooks/{bookId}/{kind}/{id}", {
              params: { path: { bookId, kind, id } },
              body: { name, archived },
            })
          )
        : unwrap(
            api.POST("/v1/cashbooks/{bookId}/{kind}", {
              params: { path: { bookId, kind } },
              body: { name: name ?? "" },
            })
          ),
    onSuccess: invalidate,
  })
}

export function useDeleteOption(bookId: string, kind: OptionKind) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/{kind}/{id}", {
          params: { path: { bookId, kind, id } },
        })
      ),
    onSuccess: invalidate,
  })
}

export function useBookMembers(bookId: string) {
  const invalidate = useInvalidate()
  const add = useMutation({
    mutationFn: (body: { memberId: string; role: CashbookRole }) =>
      unwrap(
        api.POST("/v1/cashbooks/{bookId}/members", {
          params: { path: { bookId } },
          body,
        })
      ),
    onSuccess: invalidate,
  })
  const setRole = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string
      role: CashbookRole
    }) =>
      unwrap(
        api.PATCH("/v1/cashbooks/{bookId}/members/{memberId}", {
          params: { path: { bookId, memberId } },
          body: { role },
        })
      ),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/members/{memberId}", {
          params: { path: { bookId, memberId } },
        })
      ),
    onSuccess: invalidate,
  })
  return { add, setRole, remove }
}
