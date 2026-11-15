"use client"

import type { PortalWorkspace } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"

import {
  isSignedOut,
  usePortalMe,
  usePortalSignOut,
  usePortalWorkspace,
} from "../api/queries"
import { PortalSignIn } from "./portal-sign-in"

const NAV = [
  { href: "", label: "Overview" },
  { href: "/invoices", label: "Invoices" },
  { href: "/quotes", label: "Quotes" },
  { href: "/contracts", label: "Contracts" },
  { href: "/receipts", label: "Receipts" },
]

/** Workspace name or logo (paid plans), used on every portal screen. */
export function PortalBrand({ workspace }: { workspace?: PortalWorkspace }) {
  if (!workspace) return <Skeleton className="h-7 w-32" />
  return workspace.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- presigned, short-lived URL
    <img
      src={workspace.logoUrl}
      alt={workspace.name}
      className="max-h-8 max-w-40 object-contain"
    />
  ) : (
    <span className="text-base font-semibold tracking-tight">
      {workspace.name}
    </span>
  )
}

export function PortalFooter({ workspace }: { workspace?: PortalWorkspace }) {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-4 py-6 text-xs text-muted-foreground sm:px-6">
      <span>
        {workspace?.email ? (
          <>
            Questions? Email{" "}
            <a className="underline" href={`mailto:${workspace.email}`}>
              {workspace.email}
            </a>
          </>
        ) : null}
      </span>
      {workspace?.showBadge ? (
        <a href="https://billleaf.com" className="hover:text-foreground">
          Made with <span className="font-semibold">billleaf</span>
        </a>
      ) : null}
    </footer>
  )
}

/**
 * The portal's frame: branded header, section nav and the signed-in client.
 * Without a session it shows the sign-in form instead of the page.
 */
export function PortalFrame({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  const workspace = usePortalWorkspace(slug)
  const me = usePortalMe(slug)
  const signOut = usePortalSignOut(slug)
  const pathname = usePathname()
  const router = useRouter()
  const base = `/portal/${encodeURIComponent(slug)}`

  if (workspace.error)
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
        This portal doesn’t exist. Check the link in your email.
      </div>
    )
  if (me.error && isSignedOut(me.error))
    return <PortalSignIn slug={slug} workspace={workspace.data} />

  const brand = workspace.data?.brandColor
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header
        className="border-b bg-background"
        style={brand ? { borderTop: `3px solid ${brand}` } : undefined}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4 sm:px-6">
          <Link href={base}>
            <PortalBrand workspace={workspace.data} />
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {me.data?.client.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={signOut.isPending}
              onClick={() =>
                signOut.mutate(undefined, {
                  onSuccess: () => router.replace(base),
                })
              }
            >
              Sign out
            </Button>
          </div>
          <nav
            aria-label="Portal"
            className="-mb-px flex w-full gap-4 overflow-x-auto text-sm"
          >
            {NAV.map((n) => {
              const href = `${base}${n.href}`
              const active =
                n.href === ""
                  ? pathname === base || pathname === `/portal/${slug}`
                  : pathname.includes(`${n.href}`)
              return (
                <Link
                  key={n.href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "border-b-2 border-transparent py-3 whitespace-nowrap text-muted-foreground hover:text-foreground",
                    active && "border-primary font-medium text-foreground"
                  )}
                >
                  {n.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {me.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : me.error ? (
          <p className="text-sm text-destructive">{me.error.message}</p>
        ) : (
          children
        )}
      </main>
      <div className="mx-auto w-full max-w-5xl">
        <PortalFooter workspace={workspace.data} />
      </div>
    </div>
  )
}
