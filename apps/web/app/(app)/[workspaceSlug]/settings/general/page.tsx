import type { Metadata } from "next"

import {
  InvoiceReminderSettings,
  WorkspaceProfileForm,
} from "@/features/workspace"
import { TimeRulesSettings, TimesheetApprovalSettings } from "@/features/time"

export const metadata: Metadata = { title: "Workspace settings" }

export default function GeneralSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <WorkspaceProfileForm />
      <InvoiceReminderSettings />
      <TimeRulesSettings />
      <TimesheetApprovalSettings />
    </div>
  )
}
