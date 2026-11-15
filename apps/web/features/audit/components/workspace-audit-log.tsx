"use client"

import { useWorkspaceAudit } from "../api/queries"
import { AuditLog, useAuditState } from "./audit-log"

/** Settings → Audit log (audit.read). */
export function WorkspaceAuditLog() {
  const state = useAuditState()
  const result = useWorkspaceAudit(state.query)
  return <AuditLog state={state} result={result} />
}
