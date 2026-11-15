import type { Metadata } from "next"

import { ContractsList } from "@/features/contracts"

export const metadata: Metadata = { title: "Contracts" }

export default function ContractsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contracts</h1>
        <p className="text-sm text-muted-foreground">
          Agreements with your clients, and who signed them.
        </p>
      </div>
      <ContractsList />
    </div>
  )
}
