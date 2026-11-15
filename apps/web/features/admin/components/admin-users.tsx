"use client"

import type { AdminUserSummary } from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import * as React from "react"
import { toast } from "sonner"

import {
  columnsFor,
  DataTable,
  DataTableColumnHeader,
  DataTableEmpty,
  DataTableToolbar,
  useDataTableState,
} from "@/components/data-table"
import { Field } from "@/components/form/field"
import { PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/api"

import {
  useAdminUser,
  useAdminUsers,
  useBanUser,
  useImpersonate,
  useResendVerification,
  useRevokeSessions,
  useUnbanUser,
} from "../api/queries"

const when = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—"
const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(iso)
      )
    : "—"

function UserBadges({ u }: { u: AdminUserSummary }) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.isPlatformAdmin ? <Badge>Admin</Badge> : null}
      {u.banned ? <Badge variant="destructive">Banned</Badge> : null}
      {!u.emailVerified ? <Badge variant="secondary">Unverified</Badge> : null}
      {u.twoFactorEnabled ? <Badge variant="outline">2FA</Badge> : null}
    </span>
  )
}

const col = columnsFor<AdminUserSummary>()

export function AdminUsers() {
  const table = useDataTableState({ sort: "createdAt:desc" })
  const [view, setView] = useQueryState(
    "view",
    parseAsStringLiteral(["all", "banned"] as const).withDefault("all")
  )
  const q = useAdminUsers({
    ...table.query,
    banned: view === "banned" ? "true" : undefined,
  })
  const columns = [
    col.accessor("name", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.email}
          </p>
        </div>
      ),
    }),
    col.accessor("banned", {
      id: "status",
      header: "Status",
      enableHiding: false,
      cell: ({ row }) => <UserBadges u={row.original} />,
    }),
    col.accessor("workspaces", {
      header: "Workspaces",
      meta: {
        label: "Workspaces",
        hideBelow: "sm",
        align: "right",
        className: "tabular-nums",
      },
    }),
    col.accessor("lastSeenAt", {
      header: "Last seen",
      meta: {
        label: "Last seen",
        hideBelow: "md",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => day(getValue()),
    }),
    col.accessor("createdAt", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Joined" />
      ),
      enableSorting: true,
      meta: {
        label: "Joined",
        hideBelow: "lg",
        className: "text-muted-foreground",
      },
      cell: ({ getValue }) => day(getValue()),
    }),
  ]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Everyone with a Billleaf login." />
      <DataTable
        id="admin-users"
        columns={columns}
        data={q.data?.items}
        total={q.data?.total}
        state={table}
        isLoading={q.isPending}
        error={q.error}
        filtered={view === "banned"}
        getRowHref={(u) => `/admin/users/${u.id}`}
        empty={() => <DataTableEmpty title="No users found" />}
        toolbar={(t) => (
          <DataTableToolbar
            table={t}
            state={table}
            searchPlaceholder="Search name or email…"
            filters={
              <Tabs
                value={view}
                onValueChange={(v) => {
                  void setView(v === "all" ? null : "banned")
                  table.resetPage()
                }}
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="banned">Banned</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          />
        )}
      />
    </div>
  )
}

type Dialogs = "ban" | "unban" | "revoke" | "impersonate" | null

export function AdminUserDetail({ id }: { id: string }) {
  const q = useAdminUser(id)
  const resend = useResendVerification(id)
  const unban = useUnbanUser(id)
  const revoke = useRevokeSessions(id)
  const [dialog, setDialog] = React.useState<Dialogs>(null)
  if (q.isPending) return <Skeleton className="h-64 w-full" />
  if (q.error)
    return <p className="text-sm text-destructive">{q.error.message}</p>
  const u = q.data
  const targetable = !u.isPlatformAdmin
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={u.name}
        badge={<UserBadges u={u} />}
        description={u.email}
        actions={
          targetable ? (
            <div className="flex flex-wrap gap-2">
              {!u.emailVerified ? (
                <Button
                  variant="outline"
                  disabled={resend.isPending}
                  onClick={() =>
                    resend.mutate(undefined, {
                      onSuccess: () => toast.success("Verification email sent"),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  Resend verification
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setDialog("revoke")}>
                Sign out everywhere
              </Button>
              {u.banned ? (
                <Button variant="outline" onClick={() => setDialog("unban")}>
                  Unban
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setDialog("ban")}>
                  Ban
                </Button>
              )}
              {!u.banned ? (
                <Button onClick={() => setDialog("impersonate")}>
                  Sign in as user
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      {u.banned ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Banned{u.banReason ? `: ${u.banReason}` : ""}
          {u.banExpires ? ` · until ${when(u.banExpires)}` : " · indefinitely"}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Fact label="Joined" value={day(u.createdAt)} />
              <Fact label="Last seen" value={when(u.lastSeenAt)} />
              <Fact
                label="Email"
                value={u.emailVerified ? "Verified" : "Not verified"}
              />
              <Fact
                label="Two-factor"
                value={u.twoFactorEnabled ? "On" : "Off"}
              />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Workspaces ({u.memberships.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {u.memberships.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              u.memberships.map((m) => (
                <Link
                  key={m.workspaceId}
                  href={`/admin/workspaces/${m.workspaceId}`}
                  className="flex items-center gap-3 py-2 hover:bg-muted/40"
                >
                  <span className="truncate font-medium">{m.name}</span>
                  <Badge variant="outline" className="ml-auto">
                    {m.role}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Active sessions ({u.sessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y text-sm">
          {u.sessions.length === 0 ? (
            <p className="text-muted-foreground">Not signed in anywhere.</p>
          ) : (
            u.sessions.map((s) => (
              <div key={s.id} className="flex flex-col gap-0.5 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span>Signed in {when(s.createdAt)}</span>
                  {s.impersonatedBy ? (
                    <Badge variant="destructive">Impersonated</Badge>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.ipAddress ?? "Unknown IP"} ·{" "}
                  {s.userAgent ?? "Unknown device"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active {when(s.updatedAt)} · expires {when(s.expiresAt)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="self-start"
        nativeButton={false}
        render={<Link href={`/admin/audit?q=${encodeURIComponent(u.email)}`} />}
      >
        Audit log for this user
      </Button>

      <BanDialog
        id={id}
        open={dialog === "ban"}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === "unban"}
        onClose={() => setDialog(null)}
        title="Unban user"
        description="They can sign in again straight away."
        submit="Unban"
        mutation={unban}
        done="User unbanned"
      />
      <ReasonDialog
        open={dialog === "revoke"}
        onClose={() => setDialog(null)}
        title="Sign out everywhere"
        description="Ends every session this user has. They'll need to sign in again."
        submit="Sign out"
        mutation={revoke}
        done="Sessions revoked"
      />
      <ImpersonateDialog
        id={id}
        name={u.name}
        open={dialog === "impersonate"}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function ReasonField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <Field label="Reason" htmlFor={id} hint="Kept in the audit log.">
      <Textarea
        id={id}
        rows={2}
        required
        minLength={3}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

function ReasonDialog({
  open,
  onClose,
  title,
  description,
  submit,
  mutation,
  done,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  submit: string
  mutation: ReturnType<typeof useUnbanUser>
  done: string
}) {
  const [reason, setReason] = React.useState("")
  React.useEffect(() => {
    if (open) setReason("")
  }, [open])
  const formId = `reason-${submit.toLowerCase().replace(/\s/g, "-")}`
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(reason, {
              onSuccess: () => {
                toast.success(done)
                onClose()
              },
              onError: (err) => toast.error(errorMessage(err)),
            })
          }}
        >
          <ReasonField id={`${formId}-r`} value={reason} onChange={setReason} />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={mutation.isPending || reason.trim().length < 3}
          >
            {submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BanDialog({
  id,
  open,
  onClose,
}: {
  id: string
  open: boolean
  onClose: () => void
}) {
  const ban = useBanUser(id)
  const [reason, setReason] = React.useState("")
  const [until, setUntil] = React.useState("")
  React.useEffect(() => {
    if (!open) return
    setReason("")
    setUntil("")
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban user</DialogTitle>
          <DialogDescription>
            Signs them out everywhere and blocks new sign-ins. Their workspaces
            and data stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form
          id="ban-user"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            ban.mutate(
              {
                reason,
                expiresAt: until
                  ? new Date(`${until}T00:00:00`).toISOString()
                  : null,
              },
              {
                onSuccess: () => {
                  toast.success("User banned")
                  onClose()
                },
                onError: (err) => toast.error(errorMessage(err)),
              }
            )
          }}
        >
          <ReasonField
            id="ban-reason"
            value={reason}
            onChange={setReason}
            placeholder="e.g. Sending spam invoices"
          />
          <Field
            label="Until"
            htmlFor="ban-until"
            hint="Empty = until you unban them."
          >
            <Input
              id="ban-until"
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="ban-user"
            variant="destructive"
            disabled={ban.isPending || reason.trim().length < 3}
          >
            Ban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImpersonateDialog({
  id,
  name,
  open,
  onClose,
}: {
  id: string
  name: string
  open: boolean
  onClose: () => void
}) {
  const impersonate = useImpersonate(id)
  const [reason, setReason] = React.useState("")
  React.useEffect(() => {
    if (open) setReason("")
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in as {name}</DialogTitle>
          <DialogDescription>
            You&apos;ll see Billleaf exactly as they do for up to an hour. Your
            reason is kept in the audit log and the session is marked as
            impersonated. The admin portal is closed until you stop.
          </DialogDescription>
        </DialogHeader>
        <form
          id="impersonate"
          onSubmit={(e) => {
            e.preventDefault()
            impersonate.mutate(reason, {
              onSuccess: () => window.location.assign("/app"),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }}
        >
          <ReasonField
            id="imp-reason"
            value={reason}
            onChange={setReason}
            placeholder="e.g. Support ticket: invoice PDF looks wrong"
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="impersonate"
            disabled={impersonate.isPending || reason.trim().length < 3}
          >
            Sign in as user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
