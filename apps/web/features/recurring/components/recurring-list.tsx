"use client"

import { describeRecurrence } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useRecurringInvoices } from "../api/queries"
import { RecurringStatusBadge } from "./recurring-status-badge"

export function RecurringList() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const schedules = useRecurringInvoices()
  const rows = schedules.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission="invoice.create">
          <Button
            nativeButton={false}
            render={<Link href={`/${slug}/invoices/recurring/new`} />}
          >
            New schedule
          </Button>
        </Can>
      </div>
      {schedules.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : schedules.error ? (
        <p className="text-sm text-destructive">{schedules.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">No recurring invoices yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Bill retainers and subscriptions automatically: Billleaf creates
            each invoice on schedule, as a draft or issued and emailed.
            Available on Pro and Team plans.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="hidden md:table-cell">Next</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Amount
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/${slug}/invoices/recurring/${r.id}`)
                  }
                >
                  <TableCell>
                    <div className="font-medium">{r.clientName}</div>
                    {r.title ? (
                      <div className="text-xs text-muted-foreground">
                        {r.title}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {describeRecurrence(r.every, r.unit)}
                    <div className="text-xs text-muted-foreground">
                      {r.mode === "send" ? "Auto-send" : "Draft for review"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {r.nextRunDate ? formatDate(r.nextRunDate, locale) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {money(r.total, r.currency, locale)}
                  </TableCell>
                  <TableCell>
                    <RecurringStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
