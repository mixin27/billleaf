"use client"

import type { Member } from "@workspace/contracts"
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
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import * as React from "react"
import { toast } from "sonner"

import { usePermissions } from "@/components/permissions/can"
import { useRoles } from "@/features/roles"
import { errorMessage } from "@/lib/api"
import { formatDate } from "@/lib/format"

import {
  useCancelInvitation,
  useInviteMember,
  useRemoveMember,
  useResendInvitation,
  useSetMemberRole,
} from "../api/mutations"
import { useInvitations, useMembers } from "../api/queries"

type RoleOption = { id: string; name: string }

function RoleSelect({
  roles,
  value,
  onChange,
  disabled,
  id,
}: {
  roles: RoleOption[]
  value: string | null
  onChange: (roleId: string) => void
  disabled?: boolean
  id?: string
}) {
  return (
    <Select
      items={Object.fromEntries(roles.map((r) => [r.id, r.name]))}
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && onChange(String(v))}
    >
      <SelectTrigger id={id} size="sm" className="w-40">
        <SelectValue placeholder="Choose role" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MembersManager() {
  const { can } = usePermissions()
  const members = useMembers()
  const invitations = useInvitations()
  const roles = useRoles()
  const roleOptions: RoleOption[] = (roles.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
  }))
  const canEditRoles = can("member.update") && roleOptions.length > 0

  if (members.isPending) return <Skeleton className="h-64 w-full" />
  if (members.error)
    return <p className="text-sm text-destructive">{members.error.message}</p>

  return (
    <div className="flex flex-col gap-8">
      {can("member.invite") && roleOptions.length > 0 ? (
        <InviteForm roles={roleOptions} />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Members ({members.data.length})</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  roles={roleOptions}
                  canEditRoles={canEditRoles}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {invitations.data && invitations.data.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Pending invitations</h2>
          <div className="rounded-lg border">
            <Table>
              <TableBody>
                {invitations.data.map((inv) => (
                  <InvitationRow
                    key={inv.id}
                    invitation={inv}
                    canManage={can("member.invite")}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function InviteForm({ roles }: { roles: RoleOption[] }) {
  const invite = useInviteMember()
  const [email, setEmail] = React.useState("")
  const [roleId, setRoleId] = React.useState<string | null>(
    roles.find((r) => r.name === "Member")?.id ?? roles[0]?.id ?? null
  )
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!roleId) return
        invite.mutate(
          { email, roleId },
          {
            onSuccess: () => {
              toast.success(`Invitation sent to ${email}`)
              setEmail("")
            },
            onError: (err) => toast.error(errorMessage(err)),
          }
        )
      }}
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <label htmlFor="invite-email" className="text-sm font-medium">
          Invite by email
        </label>
        <Input
          id="invite-email"
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <RoleSelect
        id="invite-role"
        roles={roles}
        value={roleId}
        onChange={setRoleId}
      />
      <Button type="submit" disabled={invite.isPending || !email || !roleId}>
        {invite.isPending ? "Sending…" : "Send invite"}
      </Button>
    </form>
  )
}

function MemberRow({
  member,
  roles,
  canEditRoles,
}: {
  member: Member
  roles: RoleOption[]
  canEditRoles: boolean
}) {
  const { can } = usePermissions()
  const setRole = useSetMemberRole()
  const remove = useRemoveMember()
  const [confirm, setConfirm] = React.useState(false)
  const current = member.roles[0]?.id ?? null

  return (
    <TableRow>
      <TableCell>
        <p className="flex items-center gap-2 font-medium">
          {member.name}
          {member.isCurrentUser ? <Badge variant="secondary">You</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">{member.email}</p>
      </TableCell>
      <TableCell>
        {canEditRoles && member.roles.length <= 1 ? (
          <RoleSelect
            roles={roles}
            value={current}
            disabled={setRole.isPending}
            onChange={(roleId) =>
              roleId !== current &&
              setRole.mutate(
                { memberId: member.id, roleId },
                {
                  onSuccess: () =>
                    toast.success(`Updated ${member.name}'s role`),
                  onError: (e) => toast.error(errorMessage(e)),
                }
              )
            }
          />
        ) : (
          <span className="flex flex-wrap gap-1">
            {member.roles.map((r) => (
              <Badge key={r.id} variant="outline">
                {r.name}
              </Badge>
            ))}
          </span>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {formatDate(member.joinedAt)}
      </TableCell>
      <TableCell className="text-right">
        {can("member.remove") && !member.isCurrentUser ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              Remove
            </Button>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They lose access to this workspace immediately. Their own
                    account is not deleted, and you can invite them again later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setConfirm(false)
                      remove.mutate(member.id, {
                        onSuccess: () =>
                          toast.success(`${member.name} removed`),
                        onError: (e) => toast.error(errorMessage(e)),
                      })
                    }}
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

function InvitationRow({
  invitation,
  canManage,
}: {
  invitation: {
    id: string
    email: string
    role: { name: string } | null
    isExpired: boolean
    expiresAt: string
    invitedBy: string | null
  }
  canManage: boolean
}) {
  const resend = useResendInvitation()
  const cancel = useCancelInvitation()
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">
          {invitation.role?.name ?? "Member"}
          {invitation.invitedBy ? ` · invited by ${invitation.invitedBy}` : ""}
        </p>
      </TableCell>
      <TableCell>
        {invitation.isExpired ? (
          <Badge variant="outline">Expired</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">
            Expires {formatDate(invitation.expiresAt)}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {canManage ? (
          <span className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={resend.isPending}
              onClick={() =>
                resend.mutate(invitation.id, {
                  onSuccess: () => toast.success("Invitation re-sent"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Resend
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(invitation.id, {
                  onSuccess: () => toast.success("Invitation cancelled"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              Cancel
            </Button>
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  )
}
