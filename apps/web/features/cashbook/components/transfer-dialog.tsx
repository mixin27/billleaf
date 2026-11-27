"use client"

import type { Cashbook, CashbookEntry } from "@workspace/contracts"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import { useTransferEntries } from "../api/mutations"
import { useCashbooks } from "../api/queries"
import { can } from "../lib"

/** Move or copy selected entries to another book in the same currency. */
export function TransferDialog({
  book,
  entries,
  onOpenChange,
  onDone,
}: {
  book: Cashbook
  entries: CashbookEntry[] | null
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const open = entries !== null
  const books = useCashbooks()
  const transfer = useTransferEntries(book.id)
  const [mode, setMode] = React.useState<"move" | "copy">("move")
  const [toBookId, setToBookId] = React.useState<string | null>(null)
  const targets = (books.data ?? []).filter(
    (b) =>
      b.id !== book.id &&
      b.currency === book.currency &&
      can.manage(b) &&
      !b.archivedAt
  )

  React.useEffect(() => {
    if (!open) return
    setMode("move")
    setToBookId(null)
  }, [open])

  const count = entries?.length ?? 0
  const target = targets.find((b) => b.id === toBookId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Move or copy {count} {count === 1 ? "entry" : "entries"}
          </DialogTitle>
          <DialogDescription>
            {mode === "move"
              ? "Moved entries leave this book and join the other one."
              : "Copies are new entries in the other book, added by you."}{" "}
            Categories and modes are matched by name.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as never)}>
            <TabsList>
              <TabsTrigger value="move">Move</TabsTrigger>
              <TabsTrigger value="copy">Copy</TabsTrigger>
            </TabsList>
          </Tabs>
          <Field
            label={`To a ${book.currency} book`}
            htmlFor="transfer-to"
            hint={
              targets.length
                ? undefined
                : `No other ${book.currency} book where you're an admin.`
            }
          >
            <Select
              items={Object.fromEntries(targets.map((b) => [b.id, b.name]))}
              value={toBookId}
              disabled={!targets.length}
              onValueChange={(v) => setToBookId(v ? String(v) : null)}
            >
              <SelectTrigger id="transfer-to" className="w-full">
                <SelectValue placeholder="Pick a book" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!target || transfer.isPending}
            onClick={() =>
              target &&
              entries &&
              transfer.mutate(
                {
                  entryIds: entries.map((e) => e.id),
                  toBookId: target.id,
                  mode,
                },
                {
                  onSuccess: ({ count: n }) => {
                    toast.success(
                      `${n} ${n === 1 ? "entry" : "entries"} ${mode === "move" ? "moved" : "copied"} to ${target.name}`
                    )
                    onDone()
                    onOpenChange(false)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          >
            {transfer.isPending
              ? mode === "move"
                ? "Moving…"
                : "Copying…"
              : mode === "move"
                ? "Move"
                : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
