"use client"

import { type Expense } from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableSelectFilter,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Can, usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  useSaveCategory,
} from "../api/queries"
import { ExpenseFormDialog } from "./expense-form-dialog"

const BILLING = ["unbilled", "billable", "non_billable"] as const
const BILLING_LABELS: Record<(typeof BILLING)[number], string> = {
  unbilled: "To bill",
  billable: "Billable",
  non_billable: "Not billable",
}
const col = columnsFor<Expense>()

export function useWorkspaceToday() {
  const tz = useWorkspaceProfile().data?.timezone ?? "UTC"
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())
}

/** Expenses page: list with filters and totals, record/edit, categories. */
export function ExpensesList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const today = useWorkspaceToday()
  const { can } = usePermissions()
  const table = useDataTableState({ sort: "spentOn:desc" })
  const [billing, setBilling] = useQueryState(
    "billing",
    parseAsStringLiteral(BILLING)
  )
  const [category, setCategory] = useQueryState("category")
  const categories = useExpenseCategories()
  const expenses = useExpenses({
    ...table.query,
    billing: billing ?? undefined,
    categoryId: category ?? undefined,
  })
  const remove = useDeleteExpense()
  const [editing, setEditing] = React.useState<Expense | "new" | null>(null)
  const [deleting, setDeleting] = React.useState<Expense | null>(null)
  const [managing, setManaging] = React.useState(false)
  const filtered = Boolean(billing || category)

  const columns = [
    col.accessor("spentOn", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Date" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { className: "text-muted-foreground" },
      cell: ({ getValue }) => formatDate(getValue(), locale),
    }),
    col.accessor("vendor", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Expense" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => {
        const e = row.original
        return (
          <button
            type="button"
            className="min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => setEditing(e)}
          >
            <span className="block truncate font-medium">
              {e.vendor ?? e.categoryName ?? "Expense"}
              {e.receipt ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  · receipt
                </span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {[e.categoryName, e.description].filter(Boolean).join(" · ") ||
                "—"}
            </span>
          </button>
        )
      },
    }),
    col.accessor("clientName", {
      header: "Client",
      meta: { label: "Client", hideBelow: "md" },
      cell: ({ row }) => {
        const e = row.original
        if (!e.clientName)
          return <span className="text-muted-foreground">—</span>
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Link
              className="underline-offset-2 hover:underline"
              href={`/${slug}/clients/${e.clientId}`}
            >
              {e.clientName}
            </Link>
            {e.invoiceId ? (
              <Link href={`/${slug}/invoices/${e.invoiceId}`}>
                <Badge variant="outline">
                  {e.invoiceNumber ?? "Draft invoice"}
                </Badge>
              </Link>
            ) : e.billable ? (
              <Badge variant="secondary">To bill</Badge>
            ) : null}
          </span>
        )
      },
    }),
    col.accessor("amount", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      enableSorting: true,
      enableHiding: false,
      meta: { align: "right", className: "tabular-nums" },
      cell: ({ row }) =>
        money(row.original.amount, row.original.currency, locale),
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="ghost" aria-label="Expense actions">
                ⋯
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {row.original.receipt ? (
              <DropdownMenuItem
                onClick={() => window.open(row.original.receipt!.url, "_blank")}
              >
                View receipt
              </DropdownMenuItem>
            ) : null}
            {can("expense.update") ? (
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                Edit
              </DropdownMenuItem>
            ) : null}
            {can("expense.delete") ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(row.original.invoiceId)}
                onClick={() => setDeleting(row.original)}
              >
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }),
  ]

  const totals = expenses.data?.totals ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        description="What the business spends, with receipts. Bill expenses to clients from their page."
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission="expense.update">
              <Button variant="outline" onClick={() => setManaging(true)}>
                Categories
              </Button>
            </Can>
            <Can permission="expense.create">
              <Button onClick={() => setEditing("new")}>New expense</Button>
            </Can>
          </div>
        }
      />

      {totals.length ? (
        <p className="text-sm text-muted-foreground">
          {filtered || table.query.q ? "Matching" : "All"} expenses:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {totals.map((t) => money(t.amount, t.currency, locale)).join(" · ")}
          </span>
        </p>
      ) : null}

      <DataTable
        id="expenses"
        columns={columns}
        data={expenses.data?.items}
        total={expenses.data?.total}
        state={table}
        isLoading={expenses.isPending}
        error={expenses.error}
        filtered={filtered}
        toolbar={(t) => (
          <DataTableToolbar
            table={t}
            state={table}
            searchPlaceholder="Search vendor, notes, reference…"
            filtered={filtered}
            onReset={() => {
              void setBilling(null)
              void setCategory(null)
            }}
            filters={
              <>
                <DataTableSelectFilter
                  title="Category"
                  value={category}
                  options={(categories.data ?? []).map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  onChange={(v) => {
                    void setCategory(v)
                    table.resetPage()
                  }}
                />
                <DataTableSelectFilter
                  title="Billing"
                  value={billing}
                  options={BILLING.map((b) => ({
                    value: b,
                    label: BILLING_LABELS[b],
                  }))}
                  onChange={(v) => {
                    void setBilling(v)
                    table.resetPage()
                  }}
                />
              </>
            }
          />
        )}
        empty={(f) =>
          f ? (
            <DataTableEmpty title="No matching expenses" />
          ) : (
            <DataTableEmpty
              title="No expenses yet"
              description="Record what you spend, attach the receipt, and see your profit in Reports."
            />
          )
        }
      />

      <ExpenseFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        expense={editing === "new" ? null : editing}
        today={today}
      />
      <CategoriesDialog open={managing} onOpenChange={setManaging} />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              The expense and its receipt are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success("Expense deleted"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const categories = useExpenseCategories()
  const save = useSaveCategory()
  const [name, setName] = React.useState("")
  const onError = (e: unknown) => toast.error(errorMessage(e))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            Hidden categories stay on past expenses but aren&apos;t offered for
            new ones.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            save.mutate({ name }, { onSuccess: () => setName(""), onError })
          }}
        >
          <Input
            aria-label="New category"
            placeholder="New category"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            Add
          </Button>
        </form>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {(categories.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-2.5">
              <span
                className={
                  c.archived
                    ? "flex-1 text-muted-foreground line-through"
                    : "flex-1"
                }
              >
                {c.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({ id: c.id, archived: !c.archived }, { onError })
                }
              >
                {c.archived ? "Show" : "Hide"}
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
