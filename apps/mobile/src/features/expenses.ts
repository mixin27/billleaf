import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CreateExpenseInput, Expense } from "@workspace/contracts"
import { File } from "expo-file-system"

import { api, ApiError, apiHeaders, unwrap } from "@/lib/api"
import { API_URL } from "@/lib/config"
import type { ReceiptPhoto } from "@/lib/receipt-photo"
import { useWorkspaceStore } from "@/stores/workspace-store"

const useWs = () => useWorkspaceStore((s) => s.workspace?.id)

/** Same key roots as the web (`apps/web/features/expenses/api/queries.ts`). */
export const expenseKeys = {
  all: (ws: string | undefined) => ["expenses", ws] as const,
  recent: (ws: string | undefined) => ["expenses", ws, "recent"] as const,
  categories: (ws: string | undefined) =>
    ["expenses", ws, "categories"] as const,
}

/** Latest expenses first (one page). */
export function useRecentExpenses(enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: expenseKeys.recent(ws),
    queryFn: () =>
      unwrap(
        api.GET("/v1/expenses", {
          params: { query: { sort: "spentOn:desc", pageSize: 30 } },
        })
      ),
    enabled: Boolean(ws) && enabled,
  })
}

/** Categories you can still pick (archived ones are hidden). */
export function useExpenseCategories(enabled = true) {
  const ws = useWs()
  return useQuery({
    queryKey: expenseKeys.categories(ws),
    queryFn: async () =>
      (await unwrap(api.GET("/v1/expense-categories"))).items.filter(
        (c) => !c.archived
      ),
    enabled: Boolean(ws) && enabled,
    staleTime: 5 * 60_000,
  })
}

/**
 * PUT the photo as multipart `file`. Expo's fetch only takes Blob-like
 * parts, so the photo goes in as an `expo-file-system` File (its name and
 * type come from the `.jpg` the photo was saved as).
 */
async function uploadReceipt(id: string, photo: ReceiptPhoto) {
  const form = new FormData()
  form.append("file", new File(photo.uri))
  const res = await fetch(`${API_URL}/v1/expenses/${id}/receipt`, {
    method: "PUT",
    body: form,
    headers: await apiHeaders(),
  })
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) throw new ApiError(res.status, body as never)
  return body as Expense
}

export type SavedExpense = {
  expense: Expense
  /** The expense was saved but its receipt wasn't (show why). */
  receiptError: unknown
}

/**
 * Record an expense, then attach the photo. A failed upload keeps the
 * expense (it's the record that matters) and reports the error.
 */
export function useCreateExpense() {
  const qc = useQueryClient()
  const ws = useWs()
  return useMutation({
    mutationFn: async ({
      body,
      photo,
    }: {
      body: CreateExpenseInput
      photo: ReceiptPhoto | null
    }): Promise<SavedExpense> => {
      const expense = await unwrap(
        api.POST("/v1/expenses", { body: body as never })
      )
      if (!photo) return { expense, receiptError: null }
      try {
        return {
          expense: await uploadReceipt(expense.id, photo),
          receiptError: null,
        }
      } catch (receiptError) {
        return { expense, receiptError }
      }
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: expenseKeys.all(ws) }),
        qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
      ]),
  })
}
