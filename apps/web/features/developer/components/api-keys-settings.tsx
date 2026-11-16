"use client"

import {
  API_KEY_EXPIRY_DAYS,
  API_KEY_PRESETS,
  API_KEY_SCOPES,
  type ApiKey,
  type Permission,
  type PermissionDefinition,
  PERMISSIONS,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { Field } from "@/components/form/field"
import { usePermissions } from "@/components/permissions/can"
import { CopyButton, SecretDialog } from "@/components/secret-dialog"
import { useWorkspaceStore } from "@/features/workspace"
import { errorMessage } from "@/lib/api"
import { docsUrl } from "@/lib/docs"
import { env } from "@/lib/env"
import { formatDate } from "@/lib/format"

import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "../api/queries"

const RESOURCE_LABELS: Record<string, string> = {
  workspace: "Workspace profile",
  client: "Clients",
  quote: "Quotes",
  contract: "Contracts",
  project: "Projects & tasks",
  time: "Time",
  invoice: "Invoices",
  payment: "Payments & receipts",
}

/** Grantable scopes grouped by resource, in catalog order. */
const GROUPS = Object.entries(
  PERMISSIONS.filter((p) => API_KEY_SCOPES.includes(p.key)).reduce<
    Record<string, PermissionDefinition[]>
  >((acc, p) => {
    ;(acc[p.resource] ??= []).push(p)
    return acc
  }, {})
)

const EXPIRY: Record<string, string> = {
  never: "Never",
  ...Object.fromEntries(
    API_KEY_EXPIRY_DAYS.map((d) => [String(d), `${d} days`])
  ),
}

function StatusBadge({ k }: { k: ApiKey }) {
  if (k.status === "revoked") return <Badge variant="secondary">Revoked</Badge>
  if (k.status === "expired")
    return <Badge variant="destructive">Expired</Badge>
  return <Badge variant="outline">Active</Badge>
}

/** Settings → API keys: keys for the Developer API. */
export function ApiKeysSettings() {
  const slug = useWorkspaceStore((s) => s.workspace?.slug)
  const keys = useApiKeys()
  const revoke = useRevokeApiKey()
  const [creating, setCreating] = React.useState(false)
  const [created, setCreated] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState<ApiKey | null>(null)
  const apiUrl = env.NEXT_PUBLIC_API_URL

  if (keys.isPending) return <Skeleton className="h-48 w-full" />
  if (keys.error)
    return <p className="text-sm text-destructive">{keys.error.message}</p>
  const { items, available } = keys.data
  const active = items.filter((k) => k.status === "active")
  const inactive = items.filter((k) => k.status !== "active")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl text-sm text-muted-foreground">
          <p>
            Let your own scripts and tools (Zapier, Make, n8n…) use Billleaf.
            Send the key as{" "}
            <code className="text-xs text-foreground">
              Authorization: Bearer blk_…
            </code>{" "}
            to <code className="text-xs text-foreground">{apiUrl}/v1/…</code>.
          </p>
          <p className="mt-2">
            A key acts as you, limited to the permissions you pick, in this
            workspace only.{" "}
            <a
              className="underline"
              href={docsUrl("/docs/developers/api-reference")}
              target="_blank"
              rel="noreferrer"
            >
              API reference
            </a>
          </p>
        </div>
        {available ? (
          <Button onClick={() => setCreating(true)}>Create API key</Button>
        ) : null}
      </div>

      {!available ? (
        <div className="rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">
            The Developer API is on the Pro and Team plans.
          </p>
          <p className="mt-1 text-muted-foreground">
            Upgrade to use API keys.
            {active.length ? " Existing keys stop working until then." : ""}
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
            No API keys yet.
          </p>
        ) : null
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {[...active, ...inactive].map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{k.name}</span>
                  <StatusBadge k={k} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <code>{k.prefix}…</code> · {k.scopes.length} permission
                  {k.scopes.length === 1 ? "" : "s"}
                  {k.createdBy ? ` · by ${k.createdBy.name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {k.lastUsedAt
                    ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                  {k.status === "revoked" && k.revokedAt
                    ? ` · revoked ${formatDate(k.revokedAt.slice(0, 10))}`
                    : k.expiresAt
                      ? ` · ${k.status === "expired" ? "expired" : "expires"} ${formatDate(k.expiresAt.slice(0, 10))}`
                      : " · never expires"}
                </p>
              </div>
              {k.status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRevoking(k)}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <CreateApiKeyDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={setCreated}
      />
      <SecretDialog
        secret={created}
        onClose={() => setCreated(null)}
        title="API key"
        description="Copy it now: it won't be shown again. Store it like a password."
      >
        {created ? <CurlExample apiKey={created} apiUrl={apiUrl} /> : null}
      </SecretDialog>
      <AlertDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this key stops working right away. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                revoking &&
                revoke.mutate(revoking.id, {
                  onSuccess: () => toast.success("API key revoked"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CurlExample({ apiKey, apiUrl }: { apiKey: string; apiUrl: string }) {
  const cmd = `curl ${apiUrl}/v1/clients \\\n  -H "Authorization: Bearer ${apiKey}"`
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs text-muted-foreground">Try it:</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
        {cmd}
      </pre>
      <div>
        <CopyButton
          value={cmd}
          label="Copy command"
          toastText="Command copied"
        />
      </div>
    </div>
  )
}

function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: string) => void
}) {
  const { can } = usePermissions()
  const create = useCreateApiKey()
  const [name, setName] = React.useState("")
  const [expiry, setExpiry] = React.useState("90")
  const [scopes, setScopes] = React.useState<Permission[]>([])
  // `can` changes identity on every render; read it through a ref so the
  // reset below runs only when the dialog opens.
  const canRef = React.useRef(can)
  canRef.current = can
  const mine = (list: readonly Permission[]) =>
    list.filter((k) => canRef.current(k))
  React.useEffect(() => {
    if (!open) return
    setName("")
    setExpiry("90")
    setScopes(API_KEY_PRESETS.read.scopes.filter((k) => canRef.current(k)))
  }, [open])
  const toggle = (k: Permission, on: boolean) =>
    setScopes((prev) => (on ? [...prev, k] : prev.filter((s) => s !== k)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The key can do only what you pick here, and never more than you can.
          </DialogDescription>
        </DialogHeader>
        <form
          id="api-key-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              {
                name,
                scopes,
                expiresInDays:
                  expiry === "never" ? null : (Number(expiry) as 30 | 90 | 365),
              },
              {
                onSuccess: (r) => {
                  onOpenChange(false)
                  onCreated(r.key)
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field
              label="Name"
              htmlFor="ak-name"
              hint="e.g. “Zapier” or “Accounting sync”."
            >
              <Input
                id="ak-name"
                required
                autoFocus
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Expires" htmlFor="ak-expiry">
              <Select
                items={EXPIRY}
                value={expiry}
                onValueChange={(v) => v && setExpiry(String(v))}
              >
                <SelectTrigger id="ak-expiry" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPIRY).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
              Permissions
              <span className="flex gap-1">
                {Object.values(API_KEY_PRESETS).map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setScopes(mine(p.scopes))}
                  >
                    {p.label}
                  </Button>
                ))}
              </span>
            </legend>
            {GROUPS.map(([resource, perms]) => (
              <div key={resource}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {RESOURCE_LABELS[resource] ?? resource}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {perms.map((p) => {
                    const id = `ak-${p.key}`
                    const held = can(p.key)
                    return (
                      <div key={p.key} className="flex items-start gap-2">
                        <Checkbox
                          id={id}
                          disabled={!held}
                          checked={scopes.includes(p.key)}
                          onCheckedChange={(c) => toggle(p.key, Boolean(c))}
                        />
                        <Label
                          htmlFor={id}
                          className="text-xs leading-snug font-normal"
                        >
                          {p.description}
                          {held ? null : (
                            <span className="text-muted-foreground">
                              {" "}
                              (you don&apos;t have this)
                            </span>
                          )}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
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
            form="api-key-form"
            disabled={create.isPending || !name.trim() || scopes.length === 0}
          >
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
