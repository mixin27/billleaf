"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useExpenses, useInvoiceExpenses } from "../api/queries"
import { ExpenseFormDialog } from "./expense-form-dialog"
import { useWorkspaceToday } from "./expenses-list"

/**
 * Client page: billable expenses not on an invoice yet, with a button per
 * currency to put them on a draft invoice.
 */
export function ClientExpenses({
  clientId,
  canCreate,
}: {
  clientId: string
  canCreate: boolean
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const today = useWorkspaceToday()
  const { can } = usePermissions()
  const unbilled = useExpenses(
    { clientId, billing: "unbilled", pageSize: 100, page: 1 },
    can("expense.read")
  )
  const invoice = useInvoiceExpenses()
  const [adding, setAdding] = React.useState(false)
  if (!can("expense.read")) return null

  const items = unbilled.data?.items ?? []
  const byCurrency = unbilled.data?.totals ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Expenses to bill</CardTitle>
        <div className="flex flex-wrap gap-2">
          {canCreate && can("expense.create") ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              New expense
            </Button>
          ) : null}
          {can("invoice.create")
            ? byCurrency.map((t) => (
                <Button
                  key={t.currency}
                  size="sm"
                  disabled={invoice.isPending}
                  onClick={() =>
                    invoice.mutate(
                      {
                        clientId,
                        expenseIds: items
                          .filter((e) => e.currency === t.currency)
                          .map((e) => e.id),
                      },
                      {
                        onSuccess: (inv) => {
                          toast.success("Draft invoice created from expenses")
                          router.push(`/${slug}/invoices/${inv.id}`)
                        },
                        onError: (e) => toast.error(errorMessage(e)),
                      }
                    )
                  }
                >
                  Invoice {money(t.amount, t.currency, locale)}
                </Button>
              ))
            : null}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to bill. Mark an expense for this client as billable to add
            it to their next invoice.{" "}
            <Link className="underline" href={`/${slug}/expenses`}>
              All expenses
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {items.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 py-2">
                <span className="w-24 shrink-0 text-muted-foreground">
                  {formatDate(e.spentOn, locale)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {e.vendor ?? e.categoryName ?? "Expense"}
                  {e.description ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.description}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">
                  {money(e.amount, e.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ExpenseFormDialog
        open={adding}
        onOpenChange={setAdding}
        today={today}
        defaultClientId={clientId}
      />
    </Card>
  )
}
