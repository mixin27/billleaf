"use client"

import type { ProjectStatus } from "@workspace/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from "nuqs"
import * as React from "react"

import { Can } from "@/components/permissions/can"
import { useWorkspaceProfile, useWorkspaceStore } from "@/features/workspace"
import { formatDate, money } from "@/lib/format"

import { useProjects } from "../api/queries"
import { ProjectFormDialog } from "./project-form-dialog"
import { ProjectStatusBadge } from "./project-status-badge"

const TABS = ["active", "on_hold", "completed", "archived"] as const
const TAB_LABELS = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
}

export function ProjectsList() {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const locale = useWorkspaceProfile().data?.locale
  const [tab, setTab] = useQueryState(
    "status",
    parseAsStringLiteral(TABS).withDefault("active")
  )
  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""))
  const [search, setSearch] = React.useState(q)
  // ?new=true opens the create dialog (used by the command menu).
  const [creating, setCreatingParam] = useQueryState(
    "new",
    parseAsBoolean.withDefault(false)
  )
  const setCreating = (v: boolean) => void setCreatingParam(v || null)
  React.useEffect(() => {
    const t = setTimeout(() => void setQ(search || null), 250)
    return () => clearTimeout(t)
  }, [search, setQ])

  const projects = useProjects({ status: tab as ProjectStatus, q })
  const rows = projects.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onValueChange={(v) => void setTab(v as (typeof TABS)[number])}
          >
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {TAB_LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            placeholder="Search project or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <Can permission="project.create">
          <Button onClick={() => setCreating(true)}>New project</Button>
        </Can>
      </div>

      {projects.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : projects.error ? (
        <p className="text-sm text-destructive">{projects.error.message}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          {q || tab !== "active"
            ? "No matching projects."
            : "No active projects. Create one, or start one from an accepted quote."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const total =
              p.taskCounts.todo + p.taskCounts.in_progress + p.taskCounts.done
            const pct = total
              ? Math.round((p.taskCounts.done / total) * 100)
              : 0
            return (
              <Link key={p.id} href={`/${slug}/projects/${p.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.clientName ?? "Internal"}
                        </p>
                      </div>
                      <ProjectStatusBadge
                        status={p.status}
                        overdue={p.isOverdue}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full bg-[var(--color-chart-3)]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {total === 0
                          ? "No tasks yet"
                          : `${p.taskCounts.done}/${total} tasks done`}
                        {p.dueDate
                          ? ` · due ${formatDate(p.dueDate, locale)}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.billing === "fixed" && p.budgetAmount != null
                        ? `Fixed · ${money(p.budgetAmount, p.currency, locale)}`
                        : p.billing === "hourly" && p.hourlyRate != null
                          ? `${money(p.hourlyRate, p.currency, locale)} / hour`
                          : p.billing === "non_billable"
                            ? "Not billable"
                            : "No rate set"}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {projects.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={projects.isFetchingNextPage}
          onClick={() => void projects.fetchNextPage()}
        >
          {projects.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <ProjectFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(p) => router.push(`/${slug}/projects/${p.id}`)}
      />
    </div>
  )
}
