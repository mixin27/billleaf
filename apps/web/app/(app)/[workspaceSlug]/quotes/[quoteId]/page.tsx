import type { Metadata } from "next"

import { QuoteDetail } from "@/features/quotes"

export const metadata: Metadata = { title: "Quote" }

export default async function QuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>
}) {
  const { quoteId } = await params
  return <QuoteDetail quoteId={quoteId} />
}
