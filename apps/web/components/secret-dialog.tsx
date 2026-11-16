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
import * as React from "react"
import { toast } from "sonner"

/** Copy a value to the clipboard, with a toast. */
export function CopyButton({
  value,
  label = "Copy",
  toastText = "Copied",
}: {
  value: string
  label?: string
  toastText?: string
}) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => setCopied(false), [value])
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          toast.success(toastText)
        })
      }
    >
      {copied ? "Copied" : label}
    </Button>
  )
}

/**
 * Shows a secret exactly once (webhook signing secret, API key), with copy.
 * `children` goes under the value (e.g. a usage example).
 */
export function SecretDialog({
  secret,
  onClose,
  title,
  description,
  children,
}: {
  secret: string | null
  onClose: () => void
  title: string
  description: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={secret ?? ""}
            className="font-mono text-xs"
            aria-label={title}
            onFocus={(e) => e.currentTarget.select()}
          />
          <CopyButton value={secret ?? ""} toastText={`${title} copied`} />
        </div>
        {children}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
