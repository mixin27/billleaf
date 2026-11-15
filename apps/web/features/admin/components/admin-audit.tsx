"use client"

import { Button } from "@workspace/ui/components/button"
import { parseAsString, useQueryState } from "nuqs"

import { PageHeader } from "@/components/page-header"
import { AuditLog, useAuditState } from "@/features/audit"

import { useAdminAudit } from "../api/queries"

/** Platform-wide audit log; `?workspace=<id>` narrows it to one workspace. */
export function AdminAudit() {
  const state = useAuditState()
  const [workspace, setWorkspace] = useQueryState("workspace", parseAsString)
  const result = useAdminAudit({
    ...state.query,
    workspaceId: workspace ?? undefined,
  })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Security-relevant and financial actions across Billleaf."
        actions={
          workspace ? (
            <Button variant="outline" onClick={() => void setWorkspace(null)}>
              Show all workspaces
            </Button>
          ) : null
        }
      />
      <AuditLog state={state} result={result} showWorkspace />
    </div>
  )
}
