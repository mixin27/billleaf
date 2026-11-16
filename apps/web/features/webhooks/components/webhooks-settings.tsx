"use client"

import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENTS,
  type WebhookEndpoint,
  type WebhookEventType,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"

import { useCreateWebhook, useUpdateWebhook, useWebhooks } from "../api/queries"

/** Status of an endpoint, in words (never colour alone). */
export function EndpointStatus({ endpoint }: { endpoint: WebhookEndpoint }) {
  if (!endpoint.enabled)
    return (
      <Badge variant={endpoint.disabledReason ? "destructive" : "secondary"}>
        {endpoint.disabledReason ? "Turned off: failing" : "Off"}
      </Badge>
    )
  if (endpoint.lastDelivery?.status === "failed")
    return <Badge variant="destructive">Last delivery failed</Badge>
  return <Badge variant="outline">On</Badge>
}

/** Settings → Webhooks: endpoints that get events from this workspace. */
export function WebhooksSettings() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const webhooks = useWebhooks()
  const [creating, setCreating] = React.useState(false)
  const [secret, setSecret] = React.useState<string | null>(null)

  if (webhooks.isPending) return <Skeleton className="h-48 w-full" />
  if (webhooks.error)
    return <p className="text-sm text-destructive">{webhooks.error.message}</p>
  const { items, available } = webhooks.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl text-sm text-muted-foreground">
          <p>
            Send events, like an invoice being paid, to another app as they
            happen. Each request is a signed JSON POST; failed deliveries are
            retried for about 2 hours.
          </p>
        </div>
        {available ? (
          <Button onClick={() => setCreating(true)}>Add webhook</Button>
        ) : null}
      </div>

      {!available ? (
        <div className="rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">Webhooks are on the Pro and Team plans.</p>
          <p className="mt-1 text-muted-foreground">
            Upgrade to connect Billleaf to your other tools.
            {items.length
              ? " Your existing webhooks are kept but get no events."
              : ""}
          </p>
          <Button
            className="mt-3"
            size="sm"
            nativeButton={false}
            render={<Link href={`/${slug}/settings/billing`} />}
          >
            See plans
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        available ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No webhooks yet.
          </p>
        ) : null
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {items.map((e) => (
            <li key={e.id}>
              <Link
                href={`/${slug}/settings/webhooks/${e.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.url}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.description ? `${e.description} · ` : ""}
                    {e.events.length} event{e.events.length === 1 ? "" : "s"}
                  </span>
                </span>
                <EndpointStatus endpoint={e} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <WebhookFormDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(s) => setSecret(s)}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  )
}

/** Create (no `endpoint`) or edit a webhook's URL, description and events. */
export function WebhookFormDialog({
  open,
  onOpenChange,
  endpoint,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint?: WebhookEndpoint
  onCreated?: (secret: string) => void
}) {
  const create = useCreateWebhook()
  const update = useUpdateWebhook()
  const [url, setUrl] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [events, setEvents] = React.useState<WebhookEventType[]>([])
  React.useEffect(() => {
    if (!open) return
    setUrl(endpoint?.url ?? "https://")
    setDescription(endpoint?.description ?? "")
    setEvents((endpoint?.events as WebhookEventType[]) ?? [])
  }, [open, endpoint])
  const pending = create.isPending || update.isPending
  const all = events.length === WEBHOOK_EVENT_TYPES.length

  const submit = () => {
    const onError = (e: unknown) => toast.error(errorMessage(e))
    if (endpoint)
      update.mutate(
        { id: endpoint.id, url, description, events },
        {
          onSuccess: () => {
            toast.success("Webhook saved")
            onOpenChange(false)
          },
          onError,
        }
      )
    else
      create.mutate(
        { url, description, events },
        {
          onSuccess: (r) => {
            onOpenChange(false)
            onCreated?.(r.secret)
          },
          onError,
        }
      )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{endpoint ? "Edit webhook" : "Add webhook"}</DialogTitle>
          <DialogDescription>
            Billleaf POSTs each selected event to this URL.
          </DialogDescription>
        </DialogHeader>
        <form
          id="webhook-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label="Endpoint URL" htmlFor="wh-url">
            <Input
              id="wh-url"
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            htmlFor="wh-desc"
            hint="Optional, e.g. “Accounting sync”."
          >
            <Input
              id="wh-desc"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
              Events
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEvents(all ? [] : [...WEBHOOK_EVENT_TYPES])}
              >
                {all ? "Clear all" : "Select all"}
              </Button>
            </legend>
            {WEBHOOK_EVENT_TYPES.map((type) => {
              const id = `wh-ev-${type}`
              return (
                <div key={type} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    checked={events.includes(type)}
                    onCheckedChange={(c) =>
                      setEvents((prev) =>
                        c ? [...prev, type] : prev.filter((t) => t !== type)
                      )
                    }
                  />
                  <Label
                    htmlFor={id}
                    className="flex flex-col items-start gap-0"
                  >
                    <span className="font-mono text-xs">{type}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {WEBHOOK_EVENTS[type]}
                    </span>
                  </Label>
                </div>
              )
            })}
          </fieldset>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="webhook-form"
            disabled={pending || events.length === 0 || !url.trim()}
          >
            {endpoint ? "Save" : "Add webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Shows a new signing secret once, with copy. */
export function SecretDialog({
  secret,
  onClose,
}: {
  secret: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => setCopied(false), [secret])
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Copy it now: it won&apos;t be shown again. Use it to check the{" "}
            <code className="text-xs">Billleaf-Signature</code> header on each
            request.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={secret ?? ""}
            className="font-mono text-xs"
            aria-label="Signing secret"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!secret) return
              void navigator.clipboard.writeText(secret).then(() => {
                setCopied(true)
                toast.success("Secret copied")
              })
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
