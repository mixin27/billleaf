"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CreateExpenseInput,
  Expense,
  ListExpensesQuery,
  UpdateExpenseInput,
} from "@workspace/contracts"

import { useWorkspaceStore } from "@/features/workspace"
import { api, ApiError, unwrap } from "@/lib/api"
import { env } from "@/lib/env"

export const expenseKeys = {
  all: (ws: string | undefined) => ["expenses", ws] as const,
  categories: (ws: string | undefined) =>
    ["expenses", ws, "categories"] as const,
}

export function useExpenses(query: ListExpensesQuery, enabled = true) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...expenseKeys.all(ws), "list", query],
    queryFn: () =>
      unwrap(api.GET("/v1/expenses", { params: { query: query as never } })),
    enabled: Boolean(ws) && enabled,
    placeholderData: (prev) => prev,
  })
}

export function useExpenseCategories() {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: expenseKeys.categories(ws),
    queryFn: async () =>
      (await unwrap(api.GET("/v1/expense-categories"))).items,
    enabled: Boolean(ws),
    staleTime: 60_000,
  })
}

export function useProfitLoss(from: string, to: string) {
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useQuery({
    queryKey: [...expenseKeys.all(ws), "profit-loss", from, to],
    queryFn: () =>
      unwrap(
        api.GET("/v1/reports/profit-loss", { params: { query: { from, to } } })
      ),
    enabled: Boolean(ws),
    placeholderData: (prev) => prev,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: expenseKeys.all(ws) }),
      qc.invalidateQueries({ queryKey: ["dashboard", ws] }),
    ])
}

export function useSaveExpense() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: (CreateExpenseInput | UpdateExpenseInput) & { id?: string }) =>
      id
        ? unwrap(
            api.PATCH("/v1/expenses/{id}", {
              params: { path: { id } },
              body: body as never,
            })
          )
        : unwrap(api.POST("/v1/expenses", { body: body as never })),
    onSuccess: invalidate,
  })
}

export function useDeleteExpense() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/v1/expenses/{id}", { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useUploadReceipt() {
  const invalidate = useInvalidate()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/expenses/${id}/receipt`,
        {
          method: "PUT",
          body: form,
          credentials: "include",
          headers: ws ? { "x-workspace-id": ws } : {},
        }
      )
      const body = await res.json().catch(() => undefined)
      if (!res.ok) throw new ApiError(res.status, body)
      return body as Expense
    },
    onSuccess: invalidate,
  })
}

export function useRemoveReceipt() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE("/v1/expenses/{id}/receipt", { params: { path: { id } } })
      ),
    onSuccess: invalidate,
  })
}

export function useSaveCategory() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string
      name?: string
      archived?: boolean
    }) =>
      id
        ? unwrap(
            api.PATCH("/v1/expense-categories/{id}", {
              params: { path: { id } },
              body,
            })
          )
        : unwrap(
            api.POST("/v1/expense-categories", {
              body: { name: body.name ?? "" },
            })
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: expenseKeys.all(ws) }),
  })
}

export function useInvoiceExpenses() {
  const qc = useQueryClient()
  const ws = useWorkspaceStore((s) => s.workspace?.id)
  return useMutation({
    mutationFn: (body: { clientId: string; expenseIds?: string[] }) =>
      unwrap(api.POST("/v1/invoices/from-expenses", { body })),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: expenseKeys.all(ws) }),
        qc.invalidateQueries({ queryKey: ["invoices", ws] }),
      ]),
  })
}
