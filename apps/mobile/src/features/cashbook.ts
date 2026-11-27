import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import type {
  Cashbook,
  CashbookEntry,
  CashbookEntryType,
  CashbookFilter,
  CashbookRole,
  CreateCashbookEntryInput,
  CreateCashbookInput,
  UpdateCashbookEntryInput,
  UpdateCashbookInput,
} from "@workspace/contracts"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import { create } from "zustand"

import { api, ApiError, apiHeaders, unwrap } from "@/lib/api"
import { type Duration, durationRange } from "@/lib/cashbook"
import { API_URL } from "@/lib/config"
import type { ReceiptPhoto } from "@/lib/receipt-photo"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same key roots as the web (`apps/web/features/cashbook`). */
export const cashbookKeys = {
  all: (ws: string | undefined) => ["cashbooks", ws] as const,
  list: (ws: string | undefined, archived: boolean) =>
    ["cashbooks", ws, "list", archived] as const,
  book: (ws: string | undefined, id: string) =>
    ["cashbooks", ws, "book", id] as const,
  entries: (ws: string | undefined, id: string, filter: CashbookFilter) =>
    ["cashbooks", ws, "book", id, "entries", filter] as const,
  entry: (ws: string | undefined, id: string, entryId: string) =>
    ["cashbooks", ws, "book", id, "entry", entryId] as const,
  options: (ws: string | undefined, id: string, kind: OptionKind) =>
    ["cashbooks", ws, "book", id, kind] as const,
  members: (ws: string | undefined, id: string) =>
    ["cashbooks", ws, "book", id, "members"] as const,
  report: (ws: string | undefined, id: string, filter: CashbookFilter) =>
    ["cashbooks", ws, "book", id, "report", filter] as const,
}

export type OptionKind = "categories" | "modes"

export { type MoneyPane, moneyPanes } from "@/lib/nav"

/** Your role lets you do this in a book. */
export const can = {
  addEntries: (b?: Cashbook) =>
    Boolean(b && !b.archivedAt && b.role !== "viewer"),
  manage: (b?: Cashbook) =>
    Boolean(b && (b.role === "admin" || b.role === "owner")),
  own: (b?: Cashbook) => b?.role === "owner",
}

// ── Filters (kept per book while the app runs) ────────────────────────────

export type BookFilters = {
  duration: Duration
  from?: string
  to?: string
  type?: CashbookEntryType
  categoryId?: string
  modeId?: string
  memberId?: string
  q?: string
}

const DEFAULT_FILTERS: BookFilters = { duration: "all" }

export const useBookFilters = create<{
  byBook: Record<string, BookFilters>
  set: (bookId: string, patch: Partial<BookFilters>) => void
  reset: (bookId: string) => void
}>((set) => ({
  byBook: {},
  set: (bookId, patch) =>
    set((s) => ({
      byBook: {
        ...s.byBook,
        [bookId]: { ...(s.byBook[bookId] ?? DEFAULT_FILTERS), ...patch },
      },
    })),
  reset: (bookId) =>
    set((s) => ({ byBook: { ...s.byBook, [bookId]: DEFAULT_FILTERS } })),
}))

export function useFiltersFor(bookId: string): BookFilters {
  return useBookFilters((s) => s.byBook[bookId] ?? DEFAULT_FILTERS)
}

/** Filters as the API wants them. */
export function toApiFilter(f: BookFilters, today?: string): CashbookFilter {
  const range = today ? durationRange(f.duration, today, f) : {}
  const out: CashbookFilter = { ...range }
  if (f.type) out.type = f.type
  if (f.categoryId) out.categoryId = f.categoryId
  if (f.modeId) out.modeId = f.modeId
  if (f.memberId) out.memberId = f.memberId
  if (f.q?.trim()) out.q = f.q.trim()
  return out
}

/** How many filters besides the date are on (for the "Filters" chip). */
export function extraFilterCount(f: BookFilters) {
  return [f.type, f.categoryId, f.modeId, f.memberId].filter(Boolean).length
}

// ── Books ─────────────────────────────────────────────────────────────────

export function useCashbooks(
  opts: { archived?: boolean; enabled?: boolean } = {}
) {
  const ws = useWs()
  const archived = opts.archived ?? false
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
    enabled: Boolean(ws) && (opts.enabled ?? true),
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

function useInvalidateBooks() {
  const qc = useQueryClient()
  const ws = useWs()
  return () => qc.invalidateQueries({ queryKey: cashbookKeys.all(ws) })
}

export function useCreateCashbook() {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: (body: CreateCashbookInput) =>
      unwrap(api.POST("/v1/cashbooks", { body: body as never })),
    onSettled: invalidate,
  })
}

export function useUpdateCashbook(id: string) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: (body: UpdateCashbookInput) =>
      unwrap(
        api.PATCH("/v1/cashbooks/{bookId}", {
          params: { path: { bookId: id } },
          body: body as never,
        })
      ),
    onSettled: invalidate,
  })
}

export function useDeleteCashbook(id: string) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}", {
          params: { path: { bookId: id } },
        })
      ),
    onSettled: invalidate,
  })
}

// ── Entries ───────────────────────────────────────────────────────────────

const PAGE = 50

/** Newest first, 50 at a time, with totals for the filters. */
export function useCashbookEntries(bookId: string, filter: CashbookFilter) {
  const ws = useWs()
  return useInfiniteQuery({
    queryKey: cashbookKeys.entries(ws, bookId, filter),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/v1/cashbooks/{bookId}/entries", {
          params: {
            path: { bookId },
            query: { ...filter, page: pageParam, pageSize: PAGE },
          },
        })
      ),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: Boolean(ws && bookId),
  })
}

export function useCashbookEntry(bookId: string, entryId: string) {
  const ws = useWs()
  return useQuery({
    queryKey: cashbookKeys.entry(ws, bookId, entryId),
    queryFn: () =>
      unwrap(
        api.GET("/v1/cashbooks/{bookId}/entries/{id}", {
          params: { path: { bookId, id: entryId } },
        })
      ),
    enabled: Boolean(ws && bookId && entryId),
  })
}

export function useEntryActivity(bookId: string, entryId: string) {
  const ws = useWs()
  return useQuery({
    queryKey: [...cashbookKeys.entry(ws, bookId, entryId), "activity"],
    queryFn: async () =>
      (
        await unwrap(
          api.GET("/v1/cashbooks/{bookId}/entries/{id}/activity", {
            params: { path: { bookId, id: entryId } },
          })
        )
      ).items,
    enabled: Boolean(ws && bookId && entryId),
  })
}

/** POST the photo as multipart `file` (see `features/expenses.ts`). */
async function uploadAttachment(
  bookId: string,
  entryId: string,
  photo: ReceiptPhoto
): Promise<CashbookEntry> {
  const form = new FormData()
  form.append("file", new File(photo.uri))
  const res = await fetch(
    `${API_URL}/v1/cashbooks/${bookId}/entries/${entryId}/attachments`,
    { method: "POST", body: form, headers: await apiHeaders() }
  )
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) throw new ApiError(res.status, body as never)
  return body as CashbookEntry
}

export type SavedEntry = {
  entry: CashbookEntry
  /** Saved, but a photo didn't upload (show why). */
  attachmentError: unknown
}

/**
 * Add or change an entry, then upload new photos. A failed upload keeps
 * the entry: the amount is what matters.
 */
export function useSaveEntry(bookId: string) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: async ({
      id,
      body,
      photos,
    }: {
      id?: string
      body: CreateCashbookEntryInput | UpdateCashbookEntryInput
      photos: ReceiptPhoto[]
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
        for (const p of photos)
          entry = await uploadAttachment(bookId, entry.id, p)
        return { entry, attachmentError: null }
      } catch (attachmentError) {
        return { entry, attachmentError }
      }
    },
    onSettled: invalidate,
  })
}

export function useRemoveAttachment(bookId: string, entryId: string) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: (fileId: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/entries/{id}/attachments/{fileId}", {
          params: { path: { bookId, id: entryId, fileId } },
        })
      ),
    onSettled: invalidate,
  })
}

export function useDeleteEntries(bookId: string) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: (entryIds: string[]) =>
      unwrap(
        api.POST("/v1/cashbooks/{bookId}/entries/delete", {
          params: { path: { bookId } },
          body: { entryIds },
        })
      ),
    onSettled: invalidate,
  })
}

export function useTransferEntries(bookId: string) {
  const invalidate = useInvalidateBooks()
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
    onSettled: invalidate,
  })
}

// ── Categories, modes and members ─────────────────────────────────────────

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

export function useSaveOption(bookId: string, kind: OptionKind) {
  const invalidate = useInvalidateBooks()
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
    onSettled: invalidate,
  })
}

export function useDeleteOption(bookId: string, kind: OptionKind) {
  const invalidate = useInvalidateBooks()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/{kind}/{id}", {
          params: { path: { bookId, kind, id } },
        })
      ),
    onSettled: invalidate,
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

/** Everyone in the workspace (to add to a book); needs `member.read`. */
export function useWorkspaceMembers(enabled: boolean) {
  const ws = useWs()
  return useQuery({
    queryKey: ["members", ws],
    queryFn: () => unwrap(api.GET("/v1/members")),
    enabled: Boolean(ws) && enabled,
  })
}

export function useBookMember(bookId: string) {
  const invalidate = useInvalidateBooks()
  const add = useMutation({
    mutationFn: (body: { memberId: string; role: CashbookRole }) =>
      unwrap(
        api.POST("/v1/cashbooks/{bookId}/members", {
          params: { path: { bookId } },
          body,
        })
      ),
    onSettled: invalidate,
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
    onSettled: invalidate,
  })
  const remove = useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.DELETE("/v1/cashbooks/{bookId}/members/{memberId}", {
          params: { path: { bookId, memberId } },
        })
      ),
    onSettled: invalidate,
  })
  return { add, setRole, remove }
}

// ── Reports ───────────────────────────────────────────────────────────────

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

/** Download the PDF statement or CSV for the filters and open the share sheet. */
export async function shareCashbookFile(
  book: Cashbook,
  filter: CashbookFilter,
  kind: "pdf" | "csv"
) {
  const query = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1]))
  ).toString()
  const path = kind === "pdf" ? "statement.pdf" : "export.csv"
  const range =
    filter.from || filter.to ? ` ${filter.from ?? ""}–${filter.to ?? ""}` : ""
  const name = `${book.name}${range}.${kind}`.replace(/[/\\?%*:|"<>]/g, "-")
  const file = await File.downloadFileAsync(
    `${API_URL}/v1/cashbooks/${book.id}/${path}${query ? `?${query}` : ""}`,
    new File(Paths.cache, name),
    { headers: await apiHeaders(), idempotent: true }
  )
  await Sharing.shareAsync(file.uri, {
    mimeType: kind === "pdf" ? "application/pdf" : "text/csv",
    UTI:
      kind === "pdf" ? "com.adobe.pdf" : "public.comma-separated-values-text",
    dialogTitle: name,
  })
}
