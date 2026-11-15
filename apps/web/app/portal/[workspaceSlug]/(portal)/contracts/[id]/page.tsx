import type { Metadata } from "next"

import { PortalContractView } from "@/features/portal"

export const metadata: Metadata = { title: "Contract" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>
}) {
  const p = await params
  return (
    <PortalContractView slug={decodeURIComponent(p.workspaceSlug)} id={p.id} />
  )
}
