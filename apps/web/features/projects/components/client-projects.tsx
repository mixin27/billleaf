"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Can } from "@/components/permissions/can"
import { useWorkspaceStore } from "@/features/workspace"

import { useProjects } from "../api/queries"
import { ProjectFormDialog } from "./project-form-dialog"
import { ProjectStatusBadge } from "./project-status-badge"

export function ClientProjects({
  clientId,
  canCreate,
}: {
  clientId: string
  canCreate: boolean
}) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const projects = useProjects({ clientId, pageSize: 10 })
  const rows = projects.data?.items ?? []
  const [creating, setCreating] = React.useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Projects</CardTitle>
        {canCreate ? (
          <Can permission="project.create">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating(true)}
            >
              New project
            </Button>
          </Can>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {projects.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            No projects for this client yet.
          </p>
        ) : (
          rows.map((p) => (
            <Link
              key={p.id}
              href={`/${slug}/projects/${p.id}`}
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <span className="font-medium">{p.name}</span>
              <ProjectStatusBadge status={p.status} overdue={p.isOverdue} />
            </Link>
          ))
        )}
      </CardContent>
      <ProjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        initialClientId={clientId}
        onSaved={(p) => router.push(`/${slug}/projects/${p.id}`)}
      />
    </Card>
  )
}
