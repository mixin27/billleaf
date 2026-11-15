import type { Metadata } from "next"
import Link from "next/link"

import { ContractTemplatesList } from "@/features/contracts"

export const metadata: Metadata = { title: "Contract templates" }

export default async function ContractTemplatesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>
}) {
  const { workspaceSlug } = await params
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/${workspaceSlug}/contracts`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Contracts
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Contract templates
        </h1>
        <p className="text-sm text-muted-foreground">
          Reusable agreements with fields that fill in for each client.
        </p>
      </div>
      <ContractTemplatesList />
    </div>
  )
}
