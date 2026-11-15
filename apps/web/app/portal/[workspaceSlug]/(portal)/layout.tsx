import type { Metadata } from "next"

import { PortalFrame } from "@/features/portal"

export const metadata: Metadata = {
  title: { default: "Client portal", template: "%s · Client portal" },
  robots: { index: false },
}

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  return (
    <PortalFrame slug={decodeURIComponent(workspaceSlug)}>
      {children}
    </PortalFrame>
  )
}
