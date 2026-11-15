import type { Metadata } from "next"

import { PortalInvoiceView } from "@/features/portal"

export const metadata: Metadata = { title: "Invoice" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; id: string }>
}) {
  const p = await params
  return (
    <PortalInvoiceView slug={decodeURIComponent(p.workspaceSlug)} id={p.id} />
  )
}
