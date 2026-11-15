import type { Metadata } from "next"

import { EditQuote } from "./edit-quote"

export const metadata: Metadata = { title: "Edit quote" }

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>
}) {
  const { quoteId } = await params
  return <EditQuote quoteId={quoteId} />
}
