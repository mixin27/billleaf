import type { Metadata } from "next"

import { PortalInvoicesPage } from "@/features/portal"

export const metadata: Metadata = { title: "Invoices" }

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const p = await params
  return <PortalInvoicesPage slug={decodeURIComponent(p.workspaceSlug)} />
}
