"use client"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate } from "@/lib/format"

import { useContractTemplates } from "../api/queries"

export function ContractTemplatesList() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const templates = useContractTemplates()
  const rows = templates.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission="contract.update">
          <Button
            nativeButton={false}
            render={<Link href={`/${slug}/contracts/templates/new`} />}
          >
            New template
          </Button>
        </Can>
      </div>
      {templates.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">No templates yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save the agreements you reuse, with fields like{" "}
            <code>{"{{client.name}}"}</code> that fill in automatically. You can
            start from the sample.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                href={`/${slug}/contracts/templates/${t.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  Updated {formatDate(t.updatedAt.slice(0, 10), locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
