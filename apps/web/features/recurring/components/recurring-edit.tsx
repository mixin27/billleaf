"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useRecurringInvoice } from "../api/queries"
import { RecurringEditor } from "./recurring-editor"

export function RecurringEdit({ id }: { id: string }) {
  const schedule = useRecurringInvoice(id)
  if (schedule.isPending) return <Skeleton className="h-96 w-full" />
  if (schedule.error)
    return <p className="text-sm text-destructive">{schedule.error.message}</p>
  return <RecurringEditor schedule={schedule.data} />
}
