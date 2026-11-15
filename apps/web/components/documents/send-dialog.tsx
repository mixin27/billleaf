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
import { Textarea } from "@workspace/ui/components/textarea"
import * as React from "react"

import { Field } from "@/components/form/field"

/** Recipient + optional message for emailing a document PDF. */
export function SendDialog({
  open,
  onOpenChange,
  title,
  defaultTo,
  pending,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultTo?: string | null
  pending: boolean
  onSend: (input: { to?: string; message?: string }) => void
}) {
  const [to, setTo] = React.useState("")
  const [message, setMessage] = React.useState("")
  React.useEffect(() => {
    if (open) {
      setTo(defaultTo ?? "")
      setMessage("")
    }
  }, [open, defaultTo])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            The PDF is attached. Replies go to your workspace email.
          </DialogDescription>
        </DialogHeader>
        <form
          id="send-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSend({
              to: to.trim() || undefined,
              message: message.trim() || undefined,
            })
          }}
        >
          <Field
            label="To"
            htmlFor="send-to"
            hint="Leave blank to use the client's primary contact."
          >
            <Input
              id="send-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field
            label="Message"
            htmlFor="send-message"
            hint="Optional, shown above the summary."
          >
            <Textarea
              id="send-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="send-form" disabled={pending}>
            {pending ? "Sending…" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
