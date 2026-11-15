import type { Metadata } from "next"

import { InvoiceEditor } from "@/features/invoices"

export const metadata: Metadata = { title: "New invoice" }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>
      <InvoiceEditor initialClientId={clientId} />
    </div>
  )
}
