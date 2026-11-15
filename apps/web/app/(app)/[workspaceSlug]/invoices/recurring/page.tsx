import type { Metadata } from "next"

import { RecurringList } from "@/features/recurring"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Recurring invoices" }

export default function RecurringInvoicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recurring invoices"
        description="Retainers and subscriptions, invoiced on schedule."
      />
      <RecurringList />
    </div>
  )
}
