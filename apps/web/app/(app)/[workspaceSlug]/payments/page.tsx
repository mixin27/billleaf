import type { Metadata } from "next"

import { PaymentsList } from "@/features/payments"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Payments" }

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Money received against your invoices, with receipts."
      />
      <PaymentsList />
    </div>
  )
}
