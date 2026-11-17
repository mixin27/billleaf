"use client"

import type { TimeImportBatch, TimeImportSource } from "@workspace/contracts"
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import * as React from "react"
import { toast } from "sonner"

import { useWorkspaceProfile } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import { useTimeImports, useUndoImport } from "../api/reports"

const SOURCE_NAMES: Record<TimeImportSource, string> = {
  clockify: "Clockify",
  toggl: "Toggl Track",
  harvest: "Harvest",
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/**
 * Time → Import: past imports with Undo. Undo deletes the import's entries
 * except invoiced or locked ones; it can be run again once those are freed.
 */
export function ImportHistory() {
  const locale = useWorkspaceProfile().data?.locale
  const imports = useTimeImports()
  const undo = useUndoImport()
  const [confirm, setConfirm] = React.useState<TimeImportBatch | null>(null)

  if (imports.isPending) return <Skeleton className="h-32 w-full" />
  if (imports.error || !imports.data?.length) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="text-base font-semibold">Past imports</p>
          <p className="text-sm text-muted-foreground">
            Undo removes an import&apos;s time entries. Invoiced entries and
            ones in a locked period or approved week are kept. Clients,
            projects, tasks and tags it created stay.
          </p>
        </div>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {imports.data.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="truncate">{b.filename}</span>
                  <Badge variant="outline">{SOURCE_NAMES[b.source]}</Badge>
                  {b.removedCount > 0 ? (
                    <Badge variant="secondary">
                      {b.remainingCount === 0 ? "Undone" : "Partly undone"}
                    </Badge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(b.createdAt.slice(0, 10), locale)}
                  {b.createdByName ? ` by ${b.createdByName}` : ""} ·{" "}
                  {plural(b.importedCount, "entry", "entries")} imported
                  {b.duplicateCount
                    ? `, ${b.duplicateCount} already there`
                    : ""}
                  {b.invalidCount ? `, ${b.invalidCount} unreadable` : ""}
                  {b.removedCount ? ` · ${b.removedCount} removed` : ""}
                  {b.remainingCount ? ` · ${b.remainingCount} still here` : ""}
                </p>
              </div>
              {b.remainingCount > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={undo.isPending}
                  onClick={() => setConfirm(b)}
                >
                  Undo
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this import?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes up to{" "}
              {plural(
                confirm?.remainingCount ?? 0,
                "time entry",
                "time entries"
              )}{" "}
              from {confirm?.filename}. Invoiced or locked entries are kept.
              This can&apos;t be reversed, but you can import the file again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                confirm &&
                undo.mutate(confirm.id, {
                  onSuccess: (r) => {
                    const kept = r.keptInvoiced + r.keptLocked
                    toast.success(
                      `Removed ${plural(r.removed, "entry", "entries")}${
                        kept
                          ? `; kept ${kept} (${[
                              r.keptInvoiced
                                ? `${r.keptInvoiced} invoiced`
                                : "",
                              r.keptLocked ? `${r.keptLocked} locked` : "",
                            ]
                              .filter(Boolean)
                              .join(", ")})`
                          : ""
                      }`
                    )
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
