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

import {
  useRefundPayment,
  useSendReceipt,
  useVoidPayment,
} from "../api/mutations"

const REVERSE = {
  void: {
    title: "Void this payment?",
    description: (receipt: string | null) =>
      `For a payment recorded by mistake, e.g. the money never arrived or it went on the wrong invoice. The invoice balance goes back up, receipt ${receipt ?? ""} is marked void, and the payment no longer counts as income.`,
    placeholder: "Reason, e.g. recorded on the wrong invoice",
    action: "Void payment",
    done: "Payment voided",
  },
  refund: {
    title: "Refund this payment?",
    description: (receipt: string | null) =>
      `Records that the money was returned: the invoice balance goes back up and receipt ${receipt ?? ""} is marked refunded. Billleaf does not move money itself.`,
    placeholder: "Reason",
    action: "Refund",
    done: "Payment refunded",
  },
} as const

/** Receipt PDF / email, refund and void for one payment. */
export function PaymentActions({
  payment,
  defaultEmail,
}: {
  payment: Payment
  defaultEmail?: string | null
}) {
  const { can } = usePermissions()
  const refund = useRefundPayment(payment.id)
  const voidPayment = useVoidPayment(payment.id)
  const send = useSendReceipt(payment.id)
  const [dialog, setDialog] = React.useState<"refund" | "void" | "send" | null>(
    null
  )
  const reverse = dialog === "refund" || dialog === "void" ? dialog : null
  const copy = REVERSE[reverse ?? "refund"]
  const mutation = reverse === "void" ? voidPayment : refund
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
            <>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("refund")}
              >
                Refund
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("void")}
              >
                Void
              </DropdownMenuItem>
            </>
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
        open={reverse !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null)
            setReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              {copy.description(payment.receiptNumber)}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason"
            placeholder={copy.placeholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={() =>
                mutation.mutate(reason.trim(), {
                  onSuccess: () => {
                    toast.success(copy.done)
                    setDialog(null)
                    setReason("")
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {copy.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
