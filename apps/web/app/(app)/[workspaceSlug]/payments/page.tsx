import type { Metadata } from "next"

import { PaymentsList } from "@/features/payments"

export const metadata: Metadata = { title: "Payments" }

export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Money received against your invoices, with receipts.
        </p>
      </div>
      <PaymentsList />
    </div>
  )
}
