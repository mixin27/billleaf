import type { Metadata } from "next"

import { ContractDetail } from "@/features/contracts"

export const metadata: Metadata = { title: "Contract" }

export default async function ContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params
  return <ContractDetail id={contractId} />
}
