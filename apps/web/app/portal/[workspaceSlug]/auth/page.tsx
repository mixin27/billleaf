import type { Metadata } from "next"
import { Suspense } from "react"

import { PortalAuth } from "@/features/portal"

export const metadata: Metadata = {
  title: "Client portal",
  robots: { index: false },
}

export default async function PortalAuthPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  return (
    <Suspense>
      <PortalAuth slug={decodeURIComponent(workspaceSlug)} />
    </Suspense>
  )
}
