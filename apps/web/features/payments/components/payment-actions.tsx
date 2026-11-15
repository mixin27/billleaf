"use client"

import type { Payment } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"
import { toast } from "sonner"

import { SendDialog } from "@/components/documents/send-dialog"
import { usePermissions } from "@/components/permissions/can"
import { errorMessage } from "@/lib/api"
import { openPdf } from "@/lib/download"

import { useRefundPayment, useSendReceipt } from "../api/mutations"

/** Receipt PDF / email and refund for one payment. */
export function PaymentActions({
  payment,
  defaultEmail,
}: {
  payment: Payment
  defaultEmail?: string | null
}) {
  const { can } = usePermissions()
  const refund = useRefundPayment(payment.id)
  const send = useSendReceipt(payment.id)
  const [dialog, setDialog] = React.useState<"refund" | "send" | null>(null)
  const [reason, setReason] = React.useState("")
  const completed = payment.status === "completed"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost">
              ⋯
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {payment.receiptId ? (
            <DropdownMenuItem
              onClick={() =>
                openPdf(`/v1/payments/${payment.id}/receipt/pdf`).catch((e) =>
                  toast.error(errorMessage(e))
                )
              }
            >
              Receipt PDF
            </DropdownMenuItem>
          ) : null}
          {completed && can("payment.record") ? (
            <DropdownMenuItem onClick={() => setDialog("send")}>
              Email receipt
            </DropdownMenuItem>
          ) : null}
          {completed && can("payment.refund") ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDialog("refund")}
            >
              Refund
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <SendDialog
        open={dialog === "send"}
        onOpenChange={(o) => setDialog(o ? "send" : null)}
        title={`Email receipt ${payment.receiptNumber}`}
        defaultTo={defaultEmail}
        pending={send.isPending}
        onSend={(input) =>
          send.mutate(input, {
            onSuccess: () => {
              toast.success("Receipt emailed")
              setDialog(null)
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />

      <Dialog
        open={dialog === "refund"}
        onOpenChange={(o) => setDialog(o ? "refund" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund this payment?</DialogTitle>
            <DialogDescription>
              Records that the money was returned: the invoice balance goes back
              up and receipt {payment.receiptNumber} is marked refunded.
              Billleaf does not move money itself.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || refund.isPending}
              onClick={() =>
                refund.mutate(reason.trim(), {
                  onSuccess: () => {
                    toast.success("Payment refunded")
                    setDialog(null)
                    setReason("")
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
