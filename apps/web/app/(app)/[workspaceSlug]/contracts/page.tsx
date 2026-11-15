import type { Metadata } from "next"

import { ContractsList } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Contracts" }

export default function ContractsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contracts"
        description="Agreements with your clients, and who signed them."
      />
      <ContractsList />
    </div>
  )
}
