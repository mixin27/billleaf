import type { Metadata } from "next"

import { RecurringEdit } from "@/features/recurring"

export const metadata: Metadata = { title: "Edit recurring invoice" }

export default async function EditRecurringInvoicePage({
  params,
}: {
  params: Promise<{ recurringId: string }>
}) {
  const { recurringId } = await params
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit recurring invoice
      </h1>
      <RecurringEdit id={recurringId} />
    </div>
  )
}
