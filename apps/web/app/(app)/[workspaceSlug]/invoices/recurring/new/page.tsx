import type { Metadata } from "next"

import { RecurringEditor } from "@/features/recurring"

export const metadata: Metadata = { title: "New recurring invoice" }

export default function NewRecurringInvoicePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        New recurring invoice
      </h1>
      <RecurringEditor />
    </div>
  )
}
