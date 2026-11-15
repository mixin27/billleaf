import type { Metadata } from "next"

import { ContractTemplatesList } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Contract templates" }

export default function ContractTemplatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contract templates"
        breadcrumb="Templates"
        description="Reusable agreements with fields that fill in for each client."
      />
      <ContractTemplatesList />
    </div>
  )
}
