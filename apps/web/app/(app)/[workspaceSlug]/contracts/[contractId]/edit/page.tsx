import type { Metadata } from "next"

import { ContractEdit } from "@/features/contracts"

export const metadata: Metadata = { title: "Edit contract" }

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit contract</h1>
      <ContractEdit id={contractId} />
    </div>
  )
}
