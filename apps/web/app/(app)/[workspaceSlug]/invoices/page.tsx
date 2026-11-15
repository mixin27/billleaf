import type { Metadata } from "next"

import { InvoicesList } from "@/features/invoices"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Invoices" }

export default function InvoicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Invoices"
        description="Bills you send to clients, and what they still owe."
      />
      <InvoicesList />
    </div>
  )
}
