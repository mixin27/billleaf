import { cookies } from "next/headers"

import { AppShell } from "@/components/layout/app-shell"
import { WorkspaceGate } from "@/features/workspace"

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  // Collapsed/expanded sidebar is remembered in a cookie (set by the sidebar).
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <WorkspaceGate slug={workspaceSlug}>
      <AppShell defaultOpen={sidebarOpen}>{children}</AppShell>
    </WorkspaceGate>
  )
}
