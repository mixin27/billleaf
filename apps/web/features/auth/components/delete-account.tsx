"use client"

import { useQuery } from "@tanstack/react-query"
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
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { api, unwrap } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

/**
 * Your account → Delete account. Blocked while you're the only owner of a
 * workspace; your work in other workspaces stays with them.
 */
export function DeleteAccount() {
  const check = useQuery({
    queryKey: ["account", "deletion-check"],
    queryFn: () => unwrap(api.GET("/v1/account/deletion-check")),
  })
  const [open, setOpen] = React.useState(false)
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [pending, setPending] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setPassword("")
    setConfirm("")
  }, [open])

  const blockers = check.data?.soleOwnerOf ?? []
  const remove = async () => {
    setPending(true)
    const { error } = await authClient.deleteUser(password ? { password } : {})
    if (error) {
      setPending(false)
      return void toast.error(error.message ?? "Couldn't delete your account")
    }
    window.location.assign("/")
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="flex flex-col gap-3">
        <p className="text-base font-semibold">Delete your account</p>
        <p className="text-sm text-muted-foreground">
          Removes your login, your sessions and your memberships. Work you did
          in other people&apos;s workspaces (time entries, documents) stays with
          them. This can&apos;t be undone.
        </p>
        {blockers.length ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p>
              You&apos;re the only owner of{" "}
              {blockers.length === 1 ? "this workspace" : "these workspaces"}.
              Delete {blockers.length === 1 ? "it" : "them"} (Settings → Data),
              or make another member an owner, first:
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {blockers.map((w) => (
                <li key={w.id}>
                  <Link className="underline" href={`/${w.slug}/settings/data`}>
                    {w.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button
          variant="destructive"
          className="self-start"
          disabled={check.isPending || blockers.length > 0}
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              You&apos;ll be signed out everywhere and won&apos;t be able to
              sign in again with this email unless you sign up anew.
            </DialogDescription>
          </DialogHeader>
          <form
            id="delete-account"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void remove()
            }}
          >
            <Field
              label="Your password"
              htmlFor="da-password"
              hint="Signed in with an email link or Google? Leave it empty — it works if you signed in within the last day."
            >
              <Input
                id="da-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label='Type "delete my account"' htmlFor="da-confirm">
              <Input
                id="da-confirm"
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
              form="delete-account"
              variant="destructive"
              disabled={
                pending || confirm.trim().toLowerCase() !== "delete my account"
              }
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
