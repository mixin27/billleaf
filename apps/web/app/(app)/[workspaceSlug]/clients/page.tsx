import type { Metadata } from "next"

import { ClientsList } from "@/features/clients"

export const metadata: Metadata = { title: "Clients" }

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">
          The people and companies you work with.
        </p>
      </div>
      <ClientsList />
    </div>
  )
}
