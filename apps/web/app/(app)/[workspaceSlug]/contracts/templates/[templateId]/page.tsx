import type { Metadata } from "next"

import { ContractTemplateEdit } from "@/features/contracts"

export const metadata: Metadata = { title: "Contract template" }

export default async function ContractTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit template</h1>
      <ContractTemplateEdit id={templateId} />
    </div>
  )
}
