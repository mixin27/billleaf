"use client"

import { useMe } from "@/features/workspace"

export default function DashboardPage() {
  const me = useMe()
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.data ? `Welcome, ${me.data.user.name.split(" ")[0]}` : "Dashboard"}
      </h1>
      <p className="text-sm text-muted-foreground">
        Clients, quotes, invoices and time tracking arrive in Phase 1.
      </p>
    </div>
  )
}
