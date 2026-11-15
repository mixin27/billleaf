import type { Metadata } from "next"

import { RecurringDetail } from "@/features/recurring"

export const metadata: Metadata = { title: "Recurring invoice" }

export default async function RecurringInvoicePage({
  params,
}: {
  params: Promise<{ recurringId: string }>
}) {
  const { recurringId } = await params
  return <RecurringDetail id={recurringId} />
}
