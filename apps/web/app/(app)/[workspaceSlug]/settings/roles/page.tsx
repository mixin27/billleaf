import type { Metadata } from "next"

import { RolesManager } from "@/features/roles"

export const metadata: Metadata = { title: "Roles & permissions" }

export default function RolesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Roles &amp; permissions</h2>
        <p className="text-sm text-muted-foreground">
          Control what each member of your workspace can see and do.
        </p>
      </div>
      <RolesManager />
    </div>
  )
}
