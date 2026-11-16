"use client"

import {
  type WebhookDelivery,
  type WebhookDeliveryStatus,
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { useRouter } from "next/navigation"
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import { PageHeader } from "@/components/page-header"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import {
  useDeleteWebhook,
  useResendDelivery,
  useRotateWebhookSecret,
  useTestWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
} from "../api/queries"
import {
  EndpointStatus,
  SecretDialog,
  WebhookFormDialog,
} from "./webhooks-settings"

const FILTERS = ["all", "failed", "succeeded", "pending"] as const
const STATUS_LABEL: Record<WebhookDeliveryStatus, string> = {
  succeeded: "Delivered",
  failed: "Failed",
  pending: "Retrying",
}

function DeliveryStatus({ d }: { d: WebhookDelivery }) {
  const label =
    d.status === "pending" && d.attempts === 0
      ? "Sending"
      : STATUS_LABEL[d.status]
  return (
    <Badge
      variant={
        d.status === "failed"
          ? "destructive"
          : d.status === "succeeded"
            ? "outline"
            : "secondary"
      }
    >
      {label}
    </Badge>
  )
}

/** One webhook: settings, test, secret, and its delivery log. */
export function WebhookDetail({ id }: { id: string }) {
  const router = useRouter()
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const webhooks = useWebhooks()
  const endpoint = webhooks.data?.items.find((e) => e.id === id)
  const update = useUpdateWebhook()
  const remove = useDeleteWebhook()
  const rotate = useRotateWebhookSecret()
  const test = useTestWebhook()
  const resend = useResendDelivery()
  const [filter, setFilter] = useQueryState(
    "status",
    parseAsStringLiteral(FILTERS).withDefault("all")
  )
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1))
  const deliveries = useWebhookDeliveries(
    id,
    page,
    filter === "all" ? undefined : filter
  )
  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<WebhookDelivery | null>(null)
  const onError = (e: unknown) => toast.error(errorMessage(e))

  if (webhooks.isPending) return <Skeleton className="h-64 w-full" />
  if (!endpoint)
    return <p className="text-sm text-muted-foreground">Webhook not found.</p>
  const available = webhooks.data?.available ?? false
  const total = deliveries.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<span className="break-all">{endpoint.url}</span>}
        breadcrumb="Webhook"
        badge={<EndpointStatus endpoint={endpoint} />}
        description={endpoint.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!available || !endpoint.enabled || test.isPending}
              onClick={() =>
                test.mutate(id, {
                  onSuccess: () => toast.success("Test event sent"),
                  onError,
                })
              }
            >
              Send test event
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              disabled={update.isPending || (!endpoint.enabled && !available)}
              onClick={() =>
                update.mutate(
                  { id, enabled: !endpoint.enabled },
                  {
                    onSuccess: () =>
                      toast.success(
                        endpoint.enabled ? "Webhook turned off" : "Webhook on"
                      ),
                    onError,
                  }
                )
              }
            >
              {endpoint.enabled ? "Turn off" : "Turn on"}
            </Button>
          </div>
        }
      />

      {endpoint.disabledReason ? (
        <p className="rounded-lg border border-destructive/40 p-3 text-sm">
          {endpoint.disabledReason}. Fix the receiving app, then turn the
          webhook back on.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Events</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {endpoint.events.map((e) => (
                <li key={e}>
                  <Badge variant="secondary" className="font-mono">
                    {e}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Signing secret</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="text-xs">{endpoint.secretHint}</code>
              <Button
                size="sm"
                variant="outline"
                disabled={rotate.isPending}
                onClick={() =>
                  rotate.mutate(id, {
                    onSuccess: (r) => setSecret(r.secret),
                    onError,
                  })
                }
              >
                Rotate secret
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Rotating takes effect right away; update the receiving app.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Deliveries</h2>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              void setFilter(v as (typeof FILTERS)[number])
              void setPage(1)
            }}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
              <TabsTrigger value="succeeded">Delivered</TabsTrigger>
              <TabsTrigger value="pending">Retrying</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {deliveries.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : !deliveries.data || deliveries.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No deliveries{filter === "all" ? " yet" : ""}. Deliveries are kept
            for 30 days.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {deliveries.data.items.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => setOpen(d)}
                >
                  <DeliveryStatus d={d} />
                  <span className="font-mono text-xs">{d.eventType}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {d.responseStatus
                      ? `HTTP ${d.responseStatus}`
                      : (d.error ?? "")}
                    {d.attempts > 1 ? ` · ${d.attempts} attempts` : ""}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!available || !endpoint.enabled || resend.isPending}
                  onClick={() =>
                    resend.mutate(d.id, {
                      onSuccess: () => toast.success("Sent again"),
                      onError,
                    })
                  }
                >
                  Resend
                </Button>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              Page {page} of {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => void setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => void setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>

      <div>
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
          Delete webhook
        </Button>
      </div>

      <WebhookFormDialog
        open={editing}
        onOpenChange={setEditing}
        endpoint={endpoint}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <DeliveryDialog delivery={open} onClose={() => setOpen(null)} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops getting events and its delivery log is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(id, {
                  onSuccess: () => {
                    toast.success("Webhook deleted")
                    router.push(`/${slug}/settings/webhooks`)
                  },
                  onError,
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

function DeliveryDialog({
  delivery: d,
  onClose,
}: {
  delivery: WebhookDelivery | null
  onClose: () => void
}) {
  return (
    <Dialog open={d !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {d?.eventType}
          </DialogTitle>
        </DialogHeader>
        {d ? (
          <div className="flex min-w-0 flex-col gap-4 text-sm">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <DeliveryStatus d={d} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Response</dt>
                <dd className="tabular-nums">
                  {d.responseStatus ? `HTTP ${d.responseStatus}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Attempts</dt>
                <dd className="tabular-nums">{d.attempts}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Time</dt>
                <dd className="tabular-nums">
                  {d.durationMs !== null ? `${d.durationMs} ms` : "—"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Event <code>{d.eventId}</code> · delivery <code>{d.id}</code>
            </p>
            {d.error ? (
              <p className="text-sm text-destructive">{d.error}</p>
            ) : null}
            {d.responseBody ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Response body (first 1 KB)
                </p>
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                  {d.responseBody}
                </pre>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Payload</p>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(d.payload, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
