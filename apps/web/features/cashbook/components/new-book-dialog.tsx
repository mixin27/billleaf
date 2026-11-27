"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { CurrencySelect } from "@/components/form/currency-select"
import { Field } from "@/components/form/field"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import { useCreateCashbook } from "../api/mutations"
import { BOOK_NAME_IDEAS } from "../lib"

/** Name a book and pick its currency; opens the new book. */
export function NewBookDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const create = useCreateCashbook()
  const [name, setName] = React.useState("")
  const [currency, setCurrency] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName("")
    setCurrency(null)
  }, [open])

  const effective = currency ?? profile.data?.defaultCurrency ?? "USD"

  const submit = () =>
    create.mutate(
      { name: name.trim(), currency: effective },
      {
        onSuccess: (book) => {
          toast.success(`${book.name} is ready`)
          // Navigate only: closing would also rewrite the URL (?new) and
          // cancel this push. The new page replaces the dialog.
          router.push(`/${slug}/cashbook/${book.id}`)
        },
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New book</DialogTitle>
          <DialogDescription>
            One book per thing you track. It starts with Cash and Online as
            payment modes.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-book"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) submit()
          }}
        >
          <Field label="Name" htmlFor="book-name">
            <Input
              id="book-name"
              autoFocus
              required
              maxLength={80}
              placeholder="e.g. Shop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {BOOK_NAME_IDEAS.map((idea) => (
              <Button
                key={idea}
                type="button"
                size="sm"
                variant={name === idea ? "secondary" : "outline"}
                onClick={() => setName(idea)}
              >
                {idea}
              </Button>
            ))}
          </div>
          <Field
            label="Currency"
            htmlFor="book-currency"
            hint="Every entry in the book uses it. You can change it until the first entry."
          >
            <CurrencySelect
              id="book-currency"
              value={effective}
              onChange={(v) => setCurrency(v)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-book"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? "Creating…" : "Create book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
