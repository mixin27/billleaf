import type { Metadata } from "next"

import { QuotesList } from "@/features/quotes"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Quotes" }

export default function QuotesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quotes"
        description="Proposals and estimates for your clients."
      />
      <QuotesList />
    </div>
  )
}
