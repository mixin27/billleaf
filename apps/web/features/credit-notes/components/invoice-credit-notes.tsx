"use client"

import type { Invoice } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import { formatDate, money } from "@/lib/format"

import { useSendCreditNote, useVoidCreditNote } from "../api/queries"

type Note = Invoice["creditNotes"][number]

/** Invoice page: credit notes issued against it, with PDF, send and void. */
export function InvoiceCreditNotes({
  invoice,
  locale,
  defaultEmail,
}: {
  invoice: Invoice
  locale?: string
  defaultEmail?: string | null
}) {
  const { can } = usePermissions()
  const send = useSendCreditNote()
  const voidNote = useVoidCreditNote()
  const [sending, setSending] = React.useState<Note | null>(null)
  const [voiding, setVoiding] = React.useState<Note | null>(null)
  const [reason, setReason] = React.useState("")
  React.useEffect(() => setReason(""), [voiding])
  if (invoice.creditNotes.length === 0) return null
  const fmt = (v: number) => money(v, invoice.currency, locale)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Credit notes</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y text-sm">
          {invoice.creditNotes.map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
            >
              <span className="font-medium">{n.number}</span>
              {n.status === "void" ? (
                <Badge variant="secondary">Void</Badge>
              ) : null}
              <span className="text-muted-foreground">
                {formatDate(n.issueDate, locale)}
              </span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {n.status === "void"
                  ? "No longer applies"
                  : [
                      n.appliedAmount > 0
                        ? `${fmt(n.appliedAmount)} off the balance`
                        : null,
                      n.refundAmount > 0
                        ? `${fmt(n.refundAmount)} refund due`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
              <span
                className={
                  n.status === "void"
                    ? "text-muted-foreground tabular-nums line-through"
                    : "tabular-nums"
                }
              >
                −{fmt(n.total)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${n.number} actions`}
                    >
                      ⋯
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      openPdf(`/v1/credit-notes/${n.id}/pdf`).catch((e) =>
                        toast.error(errorMessage(e))
                      )
                    }
                  >
                    Download PDF
                  </DropdownMenuItem>
                  {n.status === "issued" && can("invoice.send") ? (
                    <DropdownMenuItem onClick={() => setSending(n)}>
                      Email to client
                    </DropdownMenuItem>
                  ) : null}
                  {n.status === "issued" && can("invoice.void") ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setVoiding(n)}
                    >
                      Void credit note
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </CardContent>

      <SendDialog
        open={sending !== null}
        onOpenChange={(o) => !o && setSending(null)}
        title={`Email ${sending?.number ?? "credit note"}`}
        defaultTo={defaultEmail}
        pending={send.isPending}
        onSend={(input) =>
          sending &&
          send.mutate(
            { id: sending.id, ...input },
            {
              onSuccess: (r) => {
                toast.success(`Credit note emailed to ${r.lastSentTo}`)
                setSending(null)
              },
              onError: (e) => toast.error(errorMessage(e)),
            }
          )
        }
      />

      <Dialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {voiding?.number}?</DialogTitle>
            <DialogDescription>
              The credit stops applying and the invoice&apos;s balance goes back
              up. The number isn&apos;t reused.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason"
            placeholder="Reason, e.g. issued by mistake"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={voidNote.isPending || reason.trim().length < 3}
              onClick={() =>
                voiding &&
                voidNote.mutate(
                  { id: voiding.id, reason },
                  {
                    onSuccess: () => {
                      toast.success("Credit note voided")
                      setVoiding(null)
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  }
                )
              }
            >
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
