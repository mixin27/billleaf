import type { Metadata } from "next"

import { InvoicesList } from "@/features/invoices"

export const metadata: Metadata = { title: "Invoices" }

export default function InvoicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Bills you send to clients, and what they still owe.
        </p>
      </div>
      <InvoicesList />
    </div>
  )
}
