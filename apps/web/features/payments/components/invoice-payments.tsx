"use client"

import { PAYMENT_METHOD_LABELS } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { usePermissions } from "@/components/permissions/can"
import { formatDate, money } from "@/lib/format"

import { usePayments } from "../api/queries"
import { PaymentActions } from "./payment-actions"

/** Payments recorded against one invoice (invoice detail page). */
export function InvoicePayments({
  invoiceId,
  locale,
  defaultEmail,
}: {
  invoiceId: string
  locale?: string
  defaultEmail?: string | null
}) {
  const { can } = usePermissions()
  const payments = usePayments({ invoiceId }, 50, can("payment.read"))
  if (!can("payment.read")) return null
  const rows = payments.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {payments.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">No payments recorded yet.</p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <span
                    className={p.status === "refunded" ? "line-through" : ""}
                  >
                    {money(p.amount, p.currency, locale)}
                  </span>
                  {p.status === "refunded" ? (
                    <Badge variant="outline">Refunded</Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.paidOn, locale)} ·{" "}
                  {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference ? ` · ${p.reference}` : ""} · {p.receiptNumber}
                  {p.refundReason ? ` · ${p.refundReason}` : ""}
                </p>
              </div>
              <PaymentActions payment={p} defaultEmail={defaultEmail} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
