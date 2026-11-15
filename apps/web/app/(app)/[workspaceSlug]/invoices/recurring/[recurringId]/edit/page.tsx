import type { Metadata } from "next"

import { RecurringEdit } from "@/features/recurring"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Edit recurring invoice" }

export default async function EditRecurringInvoicePage({
  params,
}: {
  params: Promise<{ recurringId: string }>
}) {
  const { recurringId } = await params
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Edit recurring invoice" />
      <RecurringEdit id={recurringId} />
    </div>
  )
}
