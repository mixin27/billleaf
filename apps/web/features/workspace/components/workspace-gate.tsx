"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import * as React from "react"

import { authClient } from "@/lib/auth-client"

import { useWorkspaceStore } from "../stores/workspace-store"

/**
 * Resolves the workspace from the URL slug, makes it the session's active
 * organization and publishes it to the workspace store before rendering.
 */
export function WorkspaceGate({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  const { workspace, setWorkspace } = useWorkspaceStore()
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (workspace?.slug === slug) return
    let cancelled = false
    authClient.organization
      .setActive({ organizationSlug: slug })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setError(error?.message ?? "Workspace not found")
          return
        }
        setWorkspace({ id: data.id, slug: data.slug, name: data.name })
      })
    return () => {
      cancelled = true
    }
  }, [slug, workspace?.slug, setWorkspace])

  if (error) {
    return (
      <div className="p-10 text-sm text-muted-foreground">
        {error}. Check the URL or switch workspace.
      </div>
    )
  }
  if (workspace?.slug !== slug) {
    return (
      <div className="flex flex-col gap-3 p-10">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  return <>{children}</>
}
