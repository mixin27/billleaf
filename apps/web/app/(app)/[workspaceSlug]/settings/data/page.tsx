import type { Metadata } from "next"

import { WorkspaceDataSettings } from "@/features/workspace"

export const metadata: Metadata = { title: "Data" }

export default function DataSettingsPage() {
  return <WorkspaceDataSettings />
}
