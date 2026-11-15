import type { Metadata } from "next"

import { InvoiceEditor } from "@/features/invoices"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "New invoice" }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New invoice" />
      <InvoiceEditor initialClientId={clientId} />
    </div>
  )
}
