import type { Metadata } from "next"

import { QuotesList } from "@/features/quotes"

export const metadata: Metadata = { title: "Quotes" }

export default function QuotesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="text-sm text-muted-foreground">
          Proposals and estimates for your clients.
        </p>
      </div>
      <QuotesList />
    </div>
  )
}
