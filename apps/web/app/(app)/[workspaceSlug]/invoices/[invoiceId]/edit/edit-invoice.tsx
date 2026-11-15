"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { InvoiceEditor, useInvoice } from "@/features/invoices"
import { useWorkspaceStore } from "@/features/workspace"

export function EditInvoice({ invoiceId }: { invoiceId: string }) {
  const invoice = useInvoice(invoiceId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (invoice.isPending) return <Skeleton className="h-96 w-full" />
  if (invoice.error)
    return <p className="text-sm text-destructive">{invoice.error.message}</p>
  if (invoice.data.status !== "draft") {
    return (
      <p className="text-sm">
        Only drafts can be edited.{" "}
        <Link className="underline" href={`/${slug}/invoices/${invoiceId}`}>
          Back to the invoice
        </Link>
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit draft invoice
      </h1>
      <InvoiceEditor invoice={invoice.data} />
    </div>
  )
}
