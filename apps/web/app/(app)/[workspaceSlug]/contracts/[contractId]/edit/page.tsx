import type { Metadata } from "next"

import { ContractEdit } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Edit contract" }

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Edit contract" />
      <ContractEdit id={contractId} />
    </div>
  )
}
