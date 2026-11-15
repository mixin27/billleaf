"use client"

import { Skeleton } from "@workspace/ui/components/skeleton"

import { useContract } from "../api/queries"
import { ContractEditor } from "./contract-editor"

export function ContractEdit({ id }: { id: string }) {
  const contract = useContract(id)
  if (contract.isPending) return <Skeleton className="h-96 w-full" />
  if (contract.error)
    return <p className="text-sm text-destructive">{contract.error.message}</p>
  if (contract.data.status !== "draft")
    return (
      <p className="text-sm text-muted-foreground">
        Only draft contracts can be edited.
      </p>
    )
  return <ContractEditor contract={contract.data} />
}
