"use client"

import { describeRecurrence, type RecurringInvoice } from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import {
  useDeleteRecurring,
  useRunRecurring,
  useUpdateRecurring,
} from "../api/mutations"
import { useRecurringHistory, useRecurringInvoice } from "../api/queries"
import { RecurringStatusBadge } from "./recurring-status-badge"
import { PageHeader } from "@/components/page-header"

export function RecurringDetail({ id }: { id: string }) {
  const schedule = useRecurringInvoice(id)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (schedule.isPending) return <Skeleton className="h-96 w-full" />
  if (schedule.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{schedule.error.message}</p>
        <Link
          href={`/${slug}/invoices/recurring`}
          className="text-sm underline"
        >
          Back to recurring invoices
        </Link>
      </div>
    )
  }
  return <RecurringDetailView schedule={schedule.data} />
}

function endsLabel(r: RecurringInvoice, locale?: string) {
  if (r.maxOccurrences) return `After ${r.maxOccurrences} invoices`
  if (r.endDate) return `On ${formatDate(r.endDate, locale)}`
  return "Never"
}

function RecurringDetailView({ schedule: r }: { schedule: RecurringInvoice }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const history = useRecurringHistory(r.id)
  const { can } = usePermissions()
  const run = useRunRecurring(r.id)
  const update = useUpdateRecurring(r.id)
  const remove = useDeleteRecurring(r.id)
  const [dialog, setDialog] = React.useState<"run" | "delete" | null>(null)
  const canManage = can("invoice.create")

  const runNow = () =>
    run.mutate(undefined, {
      onSuccess: (res) => {
        setDialog(null)
        toast.success(
          res.sent
            ? `Issued and sent ${res.invoiceNumber}`
            : res.invoiceNumber
              ? `Created ${res.invoiceNumber}`
              : "Draft invoice created"
        )
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  const setStatus = (status: "active" | "paused") =>
    update.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(status === "active" ? "Schedule resumed" : "Paused"),
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  const facts: [string, React.ReactNode][] = [
    ["Client", r.clientName],
    ["Amount", money(r.total, r.currency, locale)],
    ["Frequency", describeRecurrence(r.every, r.unit)],
    ["Next invoice", r.nextRunDate ? formatDate(r.nextRunDate, locale) : "—"],
    ["Each invoice", r.mode === "send" ? "Issued & emailed" : "Draft"],
    [
      "Due",
      r.dueDays === null ? "Payment terms" : `${r.dueDays} days after issue`,
    ],
    ["Ends", endsLabel(r, locale)],
    ["Generated", String(r.generatedCount)],
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          r.title ||
          `${r.clientName} — ${describeRecurrence(r.every, r.unit).toLowerCase()}`
        }
        badge={<RecurringStatusBadge status={r.status} />}
        actions={
          <>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                {r.status === "active" ? (
                  <>
                    <Button onClick={() => setDialog("run")}>Run now</Button>
                    <Button
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => setStatus("paused")}
                    >
                      Pause
                    </Button>
                  </>
                ) : r.status === "paused" ? (
                  <Button
                    disabled={update.isPending}
                    onClick={() => setStatus("active")}
                  >
                    Resume
                  </Button>
                ) : null}
                {r.status !== "ended" ? (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={
                      <Link href={`/${slug}/invoices/recurring/${r.id}/edit`} />
                    }
                  >
                    Edit
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setDialog("delete")}>
                  Delete
                </Button>
              </div>
            ) : null}
          </>
        }
      />

      {r.lastError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {r.lastError}
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Generated invoices</h2>
        {history.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (history.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. The first one is created on{" "}
            {r.nextRunDate ? formatDate(r.nextRunDate, locale) : "—"}.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">
                    Total
                  </TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data ?? []).map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/${slug}/invoices/${inv.id}`)}
                  >
                    <TableCell>{formatDate(inv.period, locale)}</TableCell>
                    <TableCell className="font-medium">
                      {inv.number ?? (
                        <span className="text-muted-foreground">Draft</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDate(inv.dueDate, locale)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {money(inv.total, inv.currency, locale)}
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {inv.status === "issued" && inv.amountPaid >= inv.total
                        ? "paid"
                        : inv.status}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <AlertDialog
        open={dialog === "run"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create the next invoice now?</AlertDialogTitle>
            <AlertDialogDescription>
              {r.mode === "send"
                ? `The invoice dated ${formatDate(r.nextRunDate, locale)} will be issued and emailed to ${r.clientName} right away.`
                : `A draft invoice dated ${formatDate(r.nextRunDate, locale)} will be created for you to review.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={run.isPending} onClick={runNow}>
              {run.isPending
                ? "Working…"
                : r.mode === "send"
                  ? "Issue & send"
                  : "Create draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              No more invoices will be created. Invoices it already generated
              are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Schedule deleted")
                    router.push(`/${slug}/invoices/recurring`)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
