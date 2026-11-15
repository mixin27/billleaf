"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
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

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { api, ApiError, errorMessage, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { env } from "@/lib/env"

import { useWorkspaceStore } from "../stores/workspace-store"

/** Settings → Data: download everything, or delete the workspace. */
export function WorkspaceDataSettings() {
  const { can } = usePermissions()
  return (
    <div className="flex flex-col gap-6">
      {can("workspace.export") ? <ExportCard /> : null}
      {can("workspace.delete") ? <DeleteCard /> : null}
      {!can("workspace.export") && !can("workspace.delete") ? (
        <p className="text-sm text-muted-foreground">
          Only workspace owners can export or delete the workspace.
        </p>
      ) : null}
    </div>
  )
}

function ExportCard() {
  const ws = useWorkspaceStore((s) => s.workspace)
  const [pending, setPending] = React.useState(false)
  const download = async () => {
    setPending(true)
    try {
      const res = await fetch(
        `${env.NEXT_PUBLIC_API_URL}/v1/workspace/export`,
        {
          credentials: "include",
          headers: ws ? { "x-workspace-id": ws.id } : {},
        }
      )
      if (!res.ok)
        throw new ApiError(res.status, await res.json().catch(() => undefined))
      const name =
        /filename="([^"]+)"/.exec(
          res.headers.get("content-disposition") ?? ""
        )?.[1] ?? "billleaf-export.zip"
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPending(false)
    }
  }
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-semibold">Export your data</p>
        <p className="text-sm text-muted-foreground">
          A ZIP with one spreadsheet (CSV) per kind of record: clients, quotes,
          invoices and their lines, payments, receipts, contracts, projects,
          time entries, members and the audit log. PDFs and uploaded images
          aren&apos;t included.
        </p>
        <Button
          className="self-start"
          disabled={pending}
          onClick={() => void download()}
        >
          {pending ? "Preparing…" : "Download ZIP"}
        </Button>
      </CardContent>
    </Card>
  )
}

function DeleteCard() {
  const ws = useWorkspaceStore((s) => s.workspace)
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState("")
  const [pending, setPending] = React.useState(false)
  React.useEffect(() => {
    if (open) setConfirm("")
  }, [open])
  if (!ws) return null

  const remove = async () => {
    setPending(true)
    try {
      await unwrap(
        api.POST("/v1/workspace/delete", { body: { confirmSlug: confirm } })
      )
      // Forget the deleted workspace before the app picks another one.
      await authClient.organization.setActive({ organizationId: null })
      qc.clear()
      toast.success(`${ws.name} was deleted`)
      window.location.assign("/")
    } catch (err) {
      toast.error(errorMessage(err))
      setPending(false)
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-semibold">Delete this workspace</p>
        <p className="text-sm text-muted-foreground">
          Permanently deletes {ws.name}: every client, document, payment, time
          entry and file, for all members. Member accounts stay. A paid plan
          ends with it and isn&apos;t refunded. This can&apos;t be undone, so
          download your data first.
        </p>
        <Button
          variant="destructive"
          className="self-start"
          onClick={() => setOpen(true)}
        >
          Delete workspace
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {ws.name}?</DialogTitle>
            <DialogDescription>
              Everything in this workspace is deleted for good. Type{" "}
              <span className="font-mono font-medium text-foreground">
                {ws.slug}
              </span>{" "}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <form
            id="delete-workspace"
            onSubmit={(e) => {
              e.preventDefault()
              void remove()
            }}
          >
            <Field label="Workspace URL name" htmlFor="dw-confirm">
              <Input
                id="dw-confirm"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="delete-workspace"
              variant="destructive"
              disabled={pending || confirm.trim() !== ws.slug}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
