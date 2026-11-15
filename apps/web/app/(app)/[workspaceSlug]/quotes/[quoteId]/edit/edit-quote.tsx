"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { QuoteEditor, useQuote } from "@/features/quotes"
import { useWorkspaceStore } from "@/features/workspace"

export function EditQuote({ quoteId }: { quoteId: string }) {
  const quote = useQuote(quoteId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (quote.isPending) return <Skeleton className="h-96 w-full" />
  if (quote.error)
    return <p className="text-sm text-destructive">{quote.error.message}</p>
  if (quote.data.status !== "draft") {
    return (
      <p className="text-sm">
        Only drafts can be edited.{" "}
        <Link className="underline" href={`/${slug}/quotes/${quoteId}`}>
          Back to the quote
        </Link>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit draft quote
      </h1>
      <QuoteEditor quote={quote.data} />
    </div>
  )
}
