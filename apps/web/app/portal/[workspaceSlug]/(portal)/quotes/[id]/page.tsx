import type { Metadata } from "next"

import { PortalQuoteView } from "@/features/portal"

export const metadata: Metadata = { title: "Quote" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>
}) {
  const p = await params
  return (
    <PortalQuoteView slug={decodeURIComponent(p.workspaceSlug)} id={p.id} />
  )
}
