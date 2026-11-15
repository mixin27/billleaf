import type { Metadata } from "next"

import { QuoteEditor } from "@/features/quotes"

export const metadata: Metadata = { title: "New quote" }

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New quote</h1>
      <QuoteEditor initialClientId={clientId} />
    </div>
  )
}
