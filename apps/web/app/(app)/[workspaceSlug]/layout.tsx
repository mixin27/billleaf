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
  return (
    <WorkspaceGate slug={workspaceSlug}>
      <AppShell>{children}</AppShell>
    </WorkspaceGate>
  )
}
