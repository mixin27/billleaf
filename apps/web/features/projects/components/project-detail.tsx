"use client"

import {
  PROJECT_STATUS_LABELS,
  type Project,
  type ProjectStatus,
} from "@workspace/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { ProjectTime } from "@/features/time"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { formatDate, money } from "@/lib/format"

import { useDeleteProject, useUpdateProject } from "../api/mutations"
import { useProject } from "../api/queries"
import { ProjectFormDialog } from "./project-form-dialog"
import { ProjectStatusBadge } from "./project-status-badge"
import { TaskBoard } from "./task-board"
import { PageHeader } from "@/components/page-header"

export function ProjectDetail({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  if (project.isPending) return <Skeleton className="h-96 w-full" />
  if (project.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{project.error.message}</p>
        <Link href={`/${slug}/projects`} className="text-sm underline">
          Back to projects
        </Link>
      </div>
    )
  }
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: Project }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const profile = useWorkspaceProfile()
  const locale = profile.data?.locale
  const { can } = usePermissions()
  const update = useUpdateProject(project.id)
  const remove = useDeleteProject(project.id)
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: profile.data?.timezone ?? "UTC",
  }).format(new Date())

  const setStatus = (status: ProjectStatus) =>
    update.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(
            `Marked ${PROJECT_STATUS_LABELS[status].toLowerCase()}`
          ),
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        badge={
          <ProjectStatusBadge
            status={project.status}
            overdue={project.isOverdue}
          />
        }
        meta={
          <>
            <p className="text-sm text-muted-foreground">
              {project.clientId ? (
                <Link
                  className="underline"
                  href={`/${slug}/clients/${project.clientId}`}
                >
                  {project.clientName}
                </Link>
              ) : (
                "Internal project"
              )}
              {project.quoteId ? (
                <>
                  {" · from "}
                  <Link
                    className="underline"
                    href={`/${slug}/quotes/${project.quoteId}`}
                  >
                    {project.quoteNumber}
                  </Link>
                </>
              ) : null}
            </p>
          </>
        }
        actions={
          <>
            {can("project.update") || can("project.delete") ? (
              <div className="flex gap-2">
                {can("project.update") ? (
                  <>
                    {project.status === "active" ? (
                      <Button
                        variant="outline"
                        onClick={() => setStatus("completed")}
                        disabled={update.isPending}
                      >
                        Mark completed
                      </Button>
                    ) : project.status !== "archived" ? (
                      <Button
                        variant="outline"
                        onClick={() => setStatus("active")}
                        disabled={update.isPending}
                      >
                        Reopen
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  </>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline">More</Button>}
                  />
                  <DropdownMenuContent align="end">
                    {can("project.update") ? (
                      <>
                        {project.status !== "on_hold" ? (
                          <DropdownMenuItem
                            onClick={() => setStatus("on_hold")}
                          >
                            Put on hold
                          </DropdownMenuItem>
                        ) : null}
                        {project.status !== "archived" ? (
                          <DropdownMenuItem
                            onClick={() => setStatus("archived")}
                          >
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setStatus("active")}>
                            Restore
                          </DropdownMenuItem>
                        )}
                      </>
                    ) : null}
                    {can("project.delete") ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setConfirmDelete(true)}
                        >
                          Delete project
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </>
        }
      />

      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Item
              label="Billing"
              value={
                project.billing === "fixed"
                  ? project.budgetAmount != null
                    ? `Fixed · ${money(project.budgetAmount, project.currency, locale)}`
                    : "Fixed (no price set)"
                  : project.billing === "hourly"
                    ? project.hourlyRate != null
                      ? `${money(project.hourlyRate, project.currency, locale)} / hour`
                      : "Hourly (no rate set)"
                    : "Not billable"
              }
            />
            <Item label="Start" value={formatDate(project.startDate, locale)} />
            <Item label="Due" value={formatDate(project.dueDate, locale)} />
            <Item
              label="Progress"
              value={`${project.taskCounts.done}/${project.taskCounts.todo + project.taskCounts.in_progress + project.taskCounts.done} tasks`}
            />
          </dl>
          {project.description ? (
            <p className="mt-4 text-sm whitespace-pre-line">
              {project.description}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ProjectTime
        projectId={project.id}
        billing={project.billing}
        hasClient={Boolean(project.clientId)}
        locale={locale}
        today={today}
      />

      <TaskBoard projectId={project.id} locale={locale} today={today} />

      <ProjectFormDialog
        open={editing}
        onOpenChange={setEditing}
        project={project}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project and all its tasks are permanently removed. Archive it
              instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Project deleted")
                    router.push(`/${slug}/projects`)
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}
