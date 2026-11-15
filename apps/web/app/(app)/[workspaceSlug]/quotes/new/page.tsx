import type { Metadata } from "next"

import { QuoteEditor } from "@/features/quotes"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "New quote" }

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New quote" />
      <QuoteEditor initialClientId={clientId} />
    </div>
  )
}
