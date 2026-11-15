import type { Metadata } from "next"

import { PortalOverview } from "@/features/portal"

export const metadata: Metadata = { title: "Overview" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const p = await params
  return <PortalOverview slug={decodeURIComponent(p.workspaceSlug)} />
}
