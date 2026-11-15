import type { Metadata } from "next"

import { PortalQuotesPage } from "@/features/portal"

export const metadata: Metadata = { title: "Quotes" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const p = await params
  return <PortalQuotesPage slug={decodeURIComponent(p.workspaceSlug)} />
}
