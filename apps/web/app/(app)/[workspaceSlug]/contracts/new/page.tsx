import type { Metadata } from "next"

import { ContractEditor } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "New contract" }

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; quoteId?: string }>
}) {
  const { clientId, quoteId } = await searchParams
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New contract" />
      <ContractEditor initialClientId={clientId} initialQuoteId={quoteId} />
    </div>
  )
}
