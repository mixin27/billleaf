"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"
import { useRouter } from "next/navigation"
import * as React from "react"

import { useWorkspaces } from "@/features/workspace"
import { useSession } from "@/lib/auth-client"

/** Entry: send the user to their active (or first) workspace, or onboarding. */
export default function HomePage() {
  const router = useRouter()
  const session = useSession()
  const workspaces = useWorkspaces()

  React.useEffect(() => {
    if (session.isPending || workspaces.isPending) return
    if (!session.data) return router.replace("/sign-in")
    const list = workspaces.data ?? []
    const active =
      list.find((w) => w.id === session.data?.session.activeOrganizationId) ??
      list[0]
    router.replace(active ? `/${active.slug}` : "/onboarding")
  }, [
    session.isPending,
    session.data,
    workspaces.isPending,
    workspaces.data,
    router,
  ])

  return (
    <div className="p-10">
      <Skeleton className="h-8 w-40" />
    </div>
  )
}
