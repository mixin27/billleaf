import type { Metadata } from "next"

import { WorkspaceProfileForm } from "@/features/workspace"

export const metadata: Metadata = { title: "Workspace settings" }

export default function GeneralSettingsPage() {
  return <WorkspaceProfileForm />
}
