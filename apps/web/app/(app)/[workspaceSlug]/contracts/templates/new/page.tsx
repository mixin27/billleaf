import type { Metadata } from "next"

import { ContractTemplateEditor } from "@/features/contracts"

export const metadata: Metadata = { title: "New contract template" }

export default function NewContractTemplatePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
      <ContractTemplateEditor />
    </div>
  )
}
