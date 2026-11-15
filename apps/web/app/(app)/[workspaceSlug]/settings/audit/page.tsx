import type { Metadata } from "next"

import { WorkspaceAuditLog } from "@/features/audit"

export const metadata: Metadata = { title: "Audit log" }

export default function AuditLogPage() {
  return <WorkspaceAuditLog />
}
