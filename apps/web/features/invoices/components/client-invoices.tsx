"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useInvoices } from "../api/queries"
import { InvoiceStatusBadge } from "./invoice-status-badge"

export function ClientInvoices({
  clientId,
  canCreate,
}: {
  clientId: string
  canCreate: boolean
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const invoices = useInvoices({ clientId }, 10)
  const rows = invoices.data?.pages[0]?.items ?? []
  const outstanding = rows.filter((r) => r.status === "issued")

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Invoices</CardTitle>
        {canCreate ? (
          <Can permission="invoice.create">
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/${slug}/invoices/new?clientId=${clientId}`} />
              }
            >
              New invoice
            </Button>
          </Can>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {invoices.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            No invoices for this client yet.
          </p>
        ) : (
          <>
            {outstanding.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Outstanding (recent):{" "}
                {Object.entries(
                  outstanding.reduce<Record<string, number>>((acc, r) => {
                    acc[r.currency] = (acc[r.currency] ?? 0) + r.amountDue
                    return acc
                  }, {})
                )
                  .map(([cur, amt]) => money(amt, cur, locale))
                  .join(" · ")}
              </p>
            ) : null}
            {rows.map((inv) => (
              <Link
                key={inv.id}
                href={`/${slug}/invoices/${inv.id}`}
                className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{inv.number ?? "Draft"}</span>
                  <span className="hidden text-muted-foreground sm:inline">
                    {inv.dueDate
                      ? `Due ${formatDate(inv.dueDate, locale)}`
                      : formatDate(inv.issueDate, locale)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">
                    {money(inv.total, inv.currency, locale)}
                  </span>
                  <InvoiceStatusBadge status={inv.displayStatus} />
                </span>
              </Link>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}
