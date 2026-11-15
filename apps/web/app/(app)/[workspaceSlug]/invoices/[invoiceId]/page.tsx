import type { Metadata } from "next"

import { InvoiceDetail } from "@/features/invoices"

export const metadata: Metadata = { title: "Invoice" }

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = await params
  return <InvoiceDetail invoiceId={invoiceId} />
}
