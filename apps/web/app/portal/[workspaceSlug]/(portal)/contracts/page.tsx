import type { Metadata } from "next"

import { PortalContractsPage } from "@/features/portal"

export const metadata: Metadata = { title: "Contracts" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const p = await params
  return <PortalContractsPage slug={decodeURIComponent(p.workspaceSlug)} />
}
