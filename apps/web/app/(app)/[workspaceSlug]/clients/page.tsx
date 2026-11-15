import type { Metadata } from "next"

import { ClientsList } from "@/features/clients"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Clients" }

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients"
        description="The people and companies you work with."
      />
      <ClientsList />
    </div>
  )
}
