import type { Metadata } from "next"

import { ContractTemplateEdit } from "@/features/contracts"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = { title: "Contract template" }

export default async function ContractTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Edit template" />
      <ContractTemplateEdit id={templateId} />
    </div>
  )
}
