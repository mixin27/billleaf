import type { Metadata } from "next"

import { PortalReceiptsPage } from "@/features/portal"

export const metadata: Metadata = { title: "Receipts" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const p = await params
  return <PortalReceiptsPage slug={decodeURIComponent(p.workspaceSlug)} />
}
