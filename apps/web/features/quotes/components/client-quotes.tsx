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

import { useQuotes } from "../api/queries"
import { QuoteStatusBadge } from "./quote-status-badge"

/** Recent quotes for one client (used on the client detail page). */
export function ClientQuotes({
  clientId,
  canCreate,
}: {
  clientId: string
  canCreate: boolean
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const quotes = useQuotes({ clientId }, 10)
  const rows = quotes.data?.pages[0]?.items ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Quotes</CardTitle>
        {canCreate ? (
          <Can permission="quote.create">
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/${slug}/quotes/new?clientId=${clientId}`} />
              }
            >
              New quote
            </Button>
          </Can>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {quotes.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            No quotes for this client yet.
          </p>
        ) : (
          rows.map((q) => (
            <Link
              key={q.id}
              href={`/${slug}/quotes/${q.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{q.number ?? "Draft"}</span>
                <span className="hidden text-muted-foreground sm:inline">
                  {q.title ?? formatDate(q.issueDate, locale)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {money(q.total, q.currency, locale)}
                </span>
                <QuoteStatusBadge quote={q} />
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}
