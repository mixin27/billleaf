import type { Metadata } from "next"

import { ContractTemplateEditor } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "New contract template" }

export default function NewContractTemplatePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New template" />
      <ContractTemplateEditor />
    </div>
  )
}
