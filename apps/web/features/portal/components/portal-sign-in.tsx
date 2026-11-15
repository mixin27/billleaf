"use client"

import type { PortalWorkspace } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import * as React from "react"

import { Field } from "@/components/form/field"
import { errorMessage } from "@/lib/api"

import { useRequestSignIn } from "../api/queries"
import { PortalBrand, PortalFooter } from "./portal-frame"

/** Email → sign-in link. Same answer whether or not the email is known. */
export function PortalSignIn({
  slug,
  workspace,
}: {
  slug: string
  workspace?: PortalWorkspace
}) {
  const request = useRequestSignIn(slug)
  const [email, setEmail] = React.useState("")
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5">
            <PortalBrand workspace={workspace} />
            {sentTo ? (
              <div className="flex flex-col gap-2" role="status">
                <h1 className="text-lg font-semibold">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  If <b>{sentTo}</b> is on file with{" "}
                  {workspace?.name ?? "this business"}, we’ve sent a sign-in
                  link. It works once and expires in 20 minutes.
                </p>
                <Button
                  variant="outline"
                  className="mt-2 self-start"
                  onClick={() => setSentTo(null)}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  request.mutate(email, {
                    onSuccess: () => setSentTo(email.trim()),
                  })
                }}
              >
                <div className="flex flex-col gap-1">
                  <h1 className="text-lg font-semibold">Client portal</h1>
                  <p className="text-sm text-muted-foreground">
                    See your quotes, contracts, invoices and receipts
                    {workspace ? ` from ${workspace.name}` : ""}. Enter the
                    email they have for you and we’ll send a sign-in link.
                  </p>
                </div>
                <Field label="Email" htmlFor="portal-email">
                  <Input
                    id="portal-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                {request.error ? (
                  <p className="text-sm text-destructive">
                    {errorMessage(request.error)}
                  </p>
                ) : null}
                <Button type="submit" disabled={request.isPending}>
                  Email me a sign-in link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mx-auto w-full max-w-5xl">
        <PortalFooter workspace={workspace} />
      </div>
    </div>
  )
}
