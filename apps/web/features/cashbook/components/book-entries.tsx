"use client"

import type {
  Cashbook,
  CashbookEntry,
  CashbookEntryType,
} from "@workspace/contracts"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import { parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs"
import { parseAsString } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import {
  columnsFor,
  DataTable,
  DataTableEmpty,
  DataTableSelectFilter,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { DateInput } from "@/components/form/date-input"
import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useDeleteEntries } from "../api/mutations"
import {
  useCashbookEntries,
  useCashbookMembers,
  useCashbookOptions,
} from "../api/queries"
import {
  can,
  type Duration,
  DURATION_VALUES,
  DURATIONS,
  timeLabel,
  toApiFilter,
} from "../lib"
import { EntryDialog } from "./entry-dialog"
import { Signed } from "./signed"
import { TransferDialog } from "./transfer-dialog"

const col = columnsFor<CashbookEntry>()
const TYPES = ["in", "out"] as const

/** The book's filters, in the URL so a view can be shared or reloaded. */
export function useBookFilterState(today: string) {
  const [f, setF] = useQueryStates({
    duration: parseAsStringLiteral(DURATION_VALUES).withDefault("all"),
    from: parseAsString,
    to: parseAsString,
    type: parseAsStringLiteral(TYPES),
    category: parseAsString,
    mode: parseAsString,
    member: parseAsString,
  })
  const filter = (q?: string) =>
    toApiFilter(
      {
        duration: f.duration,
        from: f.from,
        to: f.to,
        type: f.type,
        categoryId: f.category,
        modeId: f.mode,
        memberId: f.member,
        q,
      },
      today
    )
  return { f, setF, filter }
}

export function BookEntries({
  book,
  today,
  onAdd,
}: {
  book: Cashbook
  today: string
  onAdd: (type: CashbookEntryType) => void
}) {
  const locale = useWorkspaceProfile().data?.locale
  const table = useDataTableState()
  const { f, setF, filter } = useBookFilterState(today)
  const query = {
    ...filter(table.q),
    page: table.page,
    pageSize: table.pageSize,
  }
  const entries = useCashbookEntries(book.id, query)
  const categories = useCashbookOptions(book.id, "categories")
  const modes = useCashbookOptions(book.id, "modes")
  const members = useCashbookMembers(book.id)
  const remove = useDeleteEntries(book.id)
  const [selected, setSelected] = React.useState<CashbookEntry[]>([])
  const [opened, setOpened] = React.useState<CashbookEntry | null>(null)
  const [deleting, setDeleting] = React.useState<CashbookEntry[] | null>(null)
  const [transferring, setTransferring] = React.useState<
    CashbookEntry[] | null
  >(null)
  const clearSelection = React.useRef<() => void>(() => {})

  const filtered = Boolean(
    f.duration !== "all" || f.type || f.category || f.mode || f.member
  )
  const m = (n: number) => money(n, book.currency, locale)
  const totals = entries.data?.totals
  const canSelect = can.manage(book) || book.role === "operator"
  const deletable = selected.filter((e) => e.editable)

  const columns = [
    ...(canSelect
      ? [
          col.display({
            id: "select",
            enableHiding: false,
            meta: { className: "w-8" },
            header: ({ table: t }) => (
              <Checkbox
                aria-label="Select all on this page"
                checked={t.getIsAllPageRowsSelected()}
                indeterminate={
                  t.getIsSomePageRowsSelected() && !t.getIsAllPageRowsSelected()
                }
                onCheckedChange={(c) => t.toggleAllPageRowsSelected(Boolean(c))}
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                aria-label="Select entry"
                checked={row.getIsSelected()}
                onCheckedChange={(c) => row.toggleSelected(Boolean(c))}
              />
            ),
          }),
        ]
      : []),
    col.accessor("entryDate", {
      header: "Date",
      enableHiding: false,
      meta: {
        hideBelow: "sm",
        className: "whitespace-nowrap text-muted-foreground",
      },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{formatDate(row.original.entryDate, locale)}</span>
          <span className="text-xs">
            {timeLabel(row.original.entryTime, locale)}
          </span>
        </span>
      ),
    }),
    col.accessor("remark", {
      header: "Details",
      enableHiding: false,
      cell: ({ row }) => {
        const e = row.original
        const title =
          e.remark ||
          e.contactName ||
          (e.type === "in" ? "Cash in" : "Cash out")
        return (
          <button
            type="button"
            className="flex min-w-0 flex-col items-start gap-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => setOpened(e)}
          >
            <span className="line-clamp-2 font-medium">{title}</span>
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {e.remark && e.contactName ? <span>{e.contactName}</span> : null}
              {e.categoryName ? (
                <Badge variant="secondary">{e.categoryName}</Badge>
              ) : null}
              {e.modeName ? (
                <Badge variant="outline">{e.modeName}</Badge>
              ) : null}
              {e.attachments.length ? (
                <span>
                  · {e.attachments.length} file
                  {e.attachments.length > 1 ? "s" : ""}
                </span>
              ) : null}
              {e.edited ? <span>· edited</span> : null}
            </span>
            {/* Small screens: amount, date and time under the details. */}
            <span className="flex flex-wrap items-baseline gap-x-2 sm:hidden">
              <Signed out={e.type === "out"} className="text-sm">
                {e.type === "in" ? "+" : "−"}
                {m(e.amount)}
              </Signed>
              <span className="text-xs text-muted-foreground">
                {formatDate(e.entryDate, locale)},{" "}
                {timeLabel(e.entryTime, locale)}
              </span>
            </span>
          </button>
        )
      },
    }),
    col.display({
      id: "by",
      header: "Entry by",
      meta: {
        label: "Entry by",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ row }) =>
        row.original.createdBy
          ? row.original.createdBy.you
            ? "You"
            : row.original.createdBy.name
          : "—",
    }),
    col.display({
      id: "in",
      header: "Cash in",
      meta: { align: "right", hideBelow: "sm" },
      cell: ({ row }) =>
        row.original.type === "in" ? (
          <Signed>{m(row.original.amount)}</Signed>
        ) : null,
    }),
    col.display({
      id: "out",
      header: "Cash out",
      meta: { align: "right", hideBelow: "sm" },
      cell: ({ row }) =>
        row.original.type === "out" ? (
          <Signed out>{m(row.original.amount)}</Signed>
        ) : null,
    }),
    col.accessor("balance", {
      header: "Balance",
      enableHiding: false,
      meta: { align: "right", className: "tabular-nums" },
      cell: ({ getValue }) => m(getValue()),
    }),
  ]

  const setFilter = (patch: {
    [K in keyof typeof f]?: (typeof f)[K] | null
  }) => {
    void setF(patch)
    table.resetPage()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <Stat label="Net balance">
          <Signed value={totals?.net ?? 0} className="text-2xl font-semibold">
            {totals ? m(totals.net) : "—"}
          </Signed>
        </Stat>
        <Stat label="Total in (+)">
          <Signed className="text-lg font-semibold">
            {totals ? m(totals.totalIn) : "—"}
          </Signed>
        </Stat>
        <Stat label="Total out (−)">
          <Signed out className="text-lg font-semibold">
            {totals ? m(totals.totalOut) : "—"}
          </Signed>
        </Stat>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          {entries.data
            ? `${filtered || table.q ? "Matching" : "Showing"} ${entries.data.total} ${entries.data.total === 1 ? "entry" : "entries"}`
            : "Loading…"}
          {filtered || table.q ? ". Totals follow the filters." : null}
        </p>
      </div>

      <DataTable
        id="cashbook-entries"
        columns={columns}
        data={entries.data?.items}
        total={entries.data?.total}
        state={table}
        isLoading={entries.isPending}
        error={entries.error}
        filtered={filtered}
        selectable={canSelect}
        onSelectionChange={setSelected}
        toolbar={(t) => {
          clearSelection.current = () => t.resetRowSelection()
          return (
            <DataTableToolbar
              table={t}
              state={table}
              searchPlaceholder="Search remark, contact or amount…"
              filtered={filtered}
              onReset={() =>
                setFilter({
                  duration: null,
                  from: null,
                  to: null,
                  type: null,
                  category: null,
                  mode: null,
                  member: null,
                })
              }
              filters={
                <>
                  <DataTableSelectFilter<Duration>
                    title="Duration"
                    value={f.duration === "all" ? null : f.duration}
                    options={DURATIONS.filter((d) => d.value !== "all").map(
                      (d) => ({ value: d.value, label: d.label })
                    )}
                    onChange={(v) =>
                      setFilter({
                        duration: v,
                        ...(v === "custom" ? {} : { from: null, to: null }),
                      })
                    }
                  />
                  {f.duration === "custom" ? (
                    <span className="flex items-center gap-1">
                      <DateInput
                        aria-label="From"
                        value={f.from}
                        onChange={(v) => setFilter({ from: v || null })}
                      />
                      <span className="text-muted-foreground">–</span>
                      <DateInput
                        aria-label="To"
                        value={f.to}
                        onChange={(v) => setFilter({ to: v || null })}
                      />
                    </span>
                  ) : null}
                  <DataTableSelectFilter<CashbookEntryType>
                    title="Type"
                    value={f.type}
                    options={[
                      { value: "in", label: "Cash in" },
                      { value: "out", label: "Cash out" },
                    ]}
                    onChange={(v) => setFilter({ type: v })}
                  />
                  {book.fields.category && categories.data?.length ? (
                    <DataTableSelectFilter
                      title="Category"
                      value={f.category}
                      options={categories.data.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      onChange={(v) => setFilter({ category: v })}
                    />
                  ) : null}
                  {book.fields.mode && modes.data?.length ? (
                    <DataTableSelectFilter
                      title="Payment mode"
                      value={f.mode}
                      options={modes.data.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      onChange={(v) => setFilter({ mode: v })}
                    />
                  ) : null}
                  {(members.data?.length ?? 0) > 1 ? (
                    <DataTableSelectFilter
                      title="Member"
                      value={f.member}
                      options={(members.data ?? []).map((mb) => ({
                        value: mb.memberId,
                        label: mb.name,
                      }))}
                      onChange={(v) => setFilter({ member: v })}
                    />
                  ) : null}
                </>
              }
              actions={
                selected.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selected.length} selected
                    </span>
                    {can.manage(book) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTransferring(selected)}
                      >
                        Move or copy
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={!deletable.length}
                      onClick={() => setDeleting(deletable)}
                    >
                      {deletable.length === selected.length
                        ? "Delete"
                        : `Delete ${deletable.length} you can change`}
                    </Button>
                  </div>
                ) : null
              }
            />
          )
        }}
        empty={(isFiltered) =>
          isFiltered || table.q ? (
            <DataTableEmpty title="No matching entries" />
          ) : (
            <DataTableEmpty
              title="Add your first entry"
              description="Record money coming in and going out. The balance updates as you go."
              action={
                can.addEntries(book) ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => onAdd("in")}>
                      + Cash in
                    </Button>
                    <Button variant="outline" onClick={() => onAdd("out")}>
                      − Cash out
                    </Button>
                  </div>
                ) : undefined
              }
            />
          )
        }
      />

      <EntryDialog
        book={book}
        open={opened !== null}
        onOpenChange={(o) => !o && setOpened(null)}
        entry={opened}
        type={opened?.type ?? "in"}
      />
      <TransferDialog
        book={book}
        entries={transferring}
        onOpenChange={(o) => !o && setTransferring(null)}
        onDone={() => clearSelection.current()}
      />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {deleting?.length === 1
                ? "this entry"
                : `${deleting?.length} entries`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They leave the balance. The audit log keeps a record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(
                  deleting.map((e) => e.id),
                  {
                    onSuccess: () => {
                      toast.success(
                        deleting.length === 1
                          ? "Entry deleted"
                          : `${deleting.length} entries deleted`
                      )
                      clearSelection.current()
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  }
                )
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

function Stat({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
