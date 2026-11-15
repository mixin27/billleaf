"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import { errorMessage } from "@/lib/api"

import { useCreatePortalSession, usePortalWorkspace } from "../api/queries"
import { PortalBrand } from "./portal-frame"

/**
 * Landing page for emailed links. Single-use sign-in links wait for a click,
 * so mail scanners that open links don't use them up. Links from document
 * emails (with `next`) are reusable, so they continue straight away.
 */
export function PortalAuth({ slug }: { slug: string }) {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get("token") ?? ""
  const rawNext = params.get("next") ?? ""
  // Only same-portal paths.
  const next = /^\/[\w/-]*$/.test(rawNext) ? rawNext : ""
  const workspace = usePortalWorkspace(slug)
  const session = useCreatePortalSession()
  const base = `/portal/${encodeURIComponent(slug)}`

  const go = React.useCallback(
    () =>
      session.mutate(token, {
        onSuccess: (s) =>
          router.replace(
            `/portal/${encodeURIComponent(s.workspaceSlug)}${next}`
          ),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, next]
  )
  const started = React.useRef(false)
  React.useEffect(() => {
    if (next && token && !started.current) {
      started.current = true
      go()
    }
  }, [next, token, go])

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5">
          <PortalBrand workspace={workspace.data} />
          {session.error || !token ? (
            <div className="flex flex-col gap-3" role="alert">
              <h1 className="text-lg font-semibold">This link doesn’t work</h1>
              <p className="text-sm text-muted-foreground">
                {token
                  ? errorMessage(session.error)
                  : "The link is incomplete."}{" "}
                You can ask for a new one.
              </p>
              <Button
                nativeButton={false}
                render={<Link href={base} />}
                className="self-start"
              >
                Get a new link
              </Button>
            </div>
          ) : next ? (
            <p className="text-sm text-muted-foreground" role="status">
              Opening your document…
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <h1 className="text-lg font-semibold">
                Sign in to {workspace.data?.name ?? "the client portal"}
              </h1>
              <Button disabled={session.isPending} onClick={go}>
                Continue to the portal
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
