import type { Metadata } from "next"

import { ContractEditor } from "@/features/contracts"

export const metadata: Metadata = { title: "New contract" }

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; quoteId?: string }>
}) {
  const { clientId, quoteId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New contract</h1>
      <ContractEditor initialClientId={clientId} initialQuoteId={quoteId} />
    </div>
  )
}
