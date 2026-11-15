import type { Metadata } from "next"

import { RecurringList } from "@/features/recurring"

export const metadata: Metadata = { title: "Recurring invoices" }

export default function RecurringInvoicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recurring invoices
        </h1>
        <p className="text-sm text-muted-foreground">
          Retainers and subscriptions, invoiced on schedule.
        </p>
      </div>
      <RecurringList />
    </div>
  )
}
