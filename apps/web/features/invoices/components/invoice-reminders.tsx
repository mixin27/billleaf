"use client"

import { type Invoice, reminderOffsetLabel } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import Link from "next/link"
import { toast } from "sonner"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useInvoiceReminders } from "../api/mutations"

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Automatic payment reminders for an issued, unpaid invoice: what went out,
 * what's next, and a switch to pause them.
 */
export function InvoiceReminders({
  invoice,
  locale,
}: {
  invoice: Invoice
  locale?: string
}) {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const offsets = useWorkspaceProfile().data?.invoiceReminderOffsets ?? []
  const toggle = useInvoiceReminders(invoice.id)
  const sent = invoice.reminders
  if (
    invoice.status !== "issued" ||
    (offsets.length === 0 && sent.length === 0)
  )
    return null

  const lastSent = sent.length
    ? Math.max(...sent.map((r) => r.offsetDays))
    : -Infinity
  const today = new Date().toISOString().slice(0, 10)
  const next =
    invoice.amountDue > 0 && invoice.dueDate && !invoice.remindersPaused
      ? offsets
          .filter((o) => o > lastSent)
          .map((o) => ({ o, day: addDays(invoice.dueDate!, o) }))
          .find((x) => x.day > invoice.issueDate && x.day >= today)
      : undefined

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold">Payment reminders</p>
          {invoice.amountDue > 0 && offsets.length ? (
            <Can permission="invoice.send">
              <Button
                size="sm"
                variant="outline"
                disabled={toggle.isPending}
                onClick={() =>
                  toggle.mutate(!invoice.remindersPaused, {
                    onSuccess: (inv) =>
                      toast.success(
                        inv.remindersPaused
                          ? "Reminders paused for this invoice"
                          : "Reminders back on"
                      ),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {invoice.remindersPaused
                  ? "Resume reminders"
                  : "Pause reminders"}
              </Button>
            </Can>
          ) : null}
        </div>
        {sent.length ? (
          <ul className="flex flex-col gap-1">
            {sent.map((r) => (
              <li key={r.offsetDays} className="text-muted-foreground">
                {reminderOffsetLabel(r.offsetDays)} · sent to {r.sentTo} on{" "}
                {formatDate(r.sentAt.slice(0, 10), locale)}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground">
          {invoice.amountDue <= 0
            ? "Paid — no more reminders."
            : !invoice.dueDate
              ? "This invoice has no due date, so no reminders are sent."
              : invoice.remindersPaused
                ? "Paused for this invoice."
                : next
                  ? `Next reminder on ${formatDate(next.day, locale)} (${reminderOffsetLabel(next.o).toLowerCase()}).`
                  : "No more reminders scheduled."}{" "}
          <Link
            href={`/${slug}/settings/general#reminders`}
            className="underline"
          >
            Reminder settings
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
