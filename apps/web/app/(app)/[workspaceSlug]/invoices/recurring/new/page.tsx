import type { Metadata } from "next"

import { RecurringEditor } from "@/features/recurring"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "New recurring invoice" }

export default function NewRecurringInvoicePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New recurring invoice" />
      <RecurringEditor />
    </div>
  )
}
