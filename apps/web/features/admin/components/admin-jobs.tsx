"use client"

import {
  ADMIN_JOB_STATES,
  ADMIN_QUEUES,
  type AdminJob,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/api"

import { useAdminJobs, useRemoveJob, useRetryJob } from "../api/queries"

const STATE_LABELS: Record<(typeof ADMIN_JOB_STATES)[number], string> = {
  failed: "Failed",
  delayed: "Delayed",
  waiting: "Waiting",
  active: "Active",
  completed: "Completed",
}

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—"

/** Background jobs (BullMQ): see failures, retry or drop them. */
export function AdminJobs() {
  const [state, setState] = useQueryState(
    "state",
    parseAsStringLiteral(ADMIN_JOB_STATES).withDefault("failed")
  )
  const [queue, setQueue] = useQueryState(
    "queue",
    parseAsStringLiteral(ADMIN_QUEUES)
  )
  const q = useAdminJobs({ state, queue: queue ?? undefined })
  const retry = useRetryJob()
  const remove = useRemoveJob()

  const act = (m: typeof retry, job: AdminJob, done: string) =>
    m.mutate(
      { queue: job.queue, id: job.id },
      {
        onSuccess: () => toast.success(done),
        onError: (e) => toast.error(errorMessage(e)),
      }
    )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jobs"
        description="Emails, recurring invoices and billing tasks run in the background."
      />

      {q.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {q.data.counts.map((c) => (
            <button
              key={c.queue}
              type="button"
              onClick={() => void setQueue(queue === c.queue ? null : c.queue)}
              className="text-left"
            >
              <Card
                className={
                  queue === c.queue
                    ? "ring-2 ring-primary"
                    : "hover:bg-muted/40"
                }
              >
                <CardContent className="flex flex-col gap-1">
                  <p className="text-sm font-medium capitalize">{c.queue}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {c.failed} failed · {c.waiting} waiting · {c.active} active
                    · {c.delayed} delayed
                  </p>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      ) : null}

      <Tabs value={state} onValueChange={(v) => void setState(v as never)}>
        <TabsList className="max-w-full overflow-x-auto">
          {ADMIN_JOB_STATES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATE_LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {q.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : q.error ? (
        <p className="text-sm text-destructive">{q.error.message}</p>
      ) : q.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No {STATE_LABELS[state].toLowerCase()} jobs
          {queue ? ` in ${queue}` : ""}.
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {q.data.items.map((job) => (
            <div
              key={`${job.queue}:${job.id}`}
              className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{job.queue}</Badge>
                  <span className="font-medium">{job.name}</span>
                  <span className="text-xs text-muted-foreground">
                    #{job.id} · {job.attemptsMade} attempt
                    {job.attemptsMade === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 truncate text-muted-foreground">
                  {job.summary}
                </p>
                {job.failedReason ? (
                  <p className="mt-1 font-mono text-xs break-all text-destructive">
                    {job.failedReason}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {when(job.createdAt)}
                  {job.finishedAt ? ` · finished ${when(job.finishedAt)}` : ""}
                </p>
              </div>
              {state === "failed" || state === "delayed" ? (
                <div className="flex gap-2">
                  {state === "failed" ? (
                    <Button
                      size="sm"
                      disabled={retry.isPending}
                      onClick={() => act(retry, job, "Job queued again")}
                    >
                      Retry
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => act(remove, job, "Job removed")}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
