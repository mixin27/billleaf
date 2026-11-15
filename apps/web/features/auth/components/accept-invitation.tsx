"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { authClient, useSession } from "@/lib/auth-client"

import { AuthCard } from "./auth-card"

/** Landing page for invitation emails: /accept-invitation/:id */
export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const session = useSession()
  const next = `/accept-invitation/${invitationId}`
  const [busy, setBusy] = React.useState<"accept" | "decline" | null>(null)

  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    enabled: Boolean(session.data),
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      })
      if (error) throw new Error(error.message ?? "Invitation not found")
      return data
    },
  })

  if (session.isPending) return <Skeleton className="h-48 w-full max-w-sm" />

  if (!session.data) {
    return (
      <AuthCard
        title="You've been invited"
        description="Sign in or create an account with the email address the invitation was sent to."
      >
        <Button
          nativeButton={false}
          render={<Link href={`/sign-in?next=${encodeURIComponent(next)}`} />}
        >
          Sign in to continue
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/sign-up?next=${encodeURIComponent(next)}`} />}
        >
          Create an account
        </Button>
      </AuthCard>
    )
  }

  if (invitation.isPending) return <Skeleton className="h-48 w-full max-w-sm" />

  if (
    invitation.error ||
    !invitation.data ||
    invitation.data.status !== "pending"
  ) {
    return (
      <AuthCard
        title="Invitation unavailable"
        description={
          invitation.error?.message ??
          "This invitation has already been used, cancelled or has expired. Ask the sender for a new one."
        }
      >
        <p className="text-sm text-muted-foreground">
          Signed in as {session.data.user.email}. If the invite went to a
          different address, sign out and use that one.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut()
            qc.clear()
            router.refresh()
          }}
        >
          Sign out and switch account
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/" />}>
          Go to Billleaf
        </Button>
      </AuthCard>
    )
  }

  const inv = invitation.data
  const accept = async () => {
    setBusy("accept")
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    })
    if (error) {
      setBusy(null)
      toast.error(error.message ?? "Could not accept the invitation")
      return
    }
    await authClient.organization.setActive({
      organizationId: inv.organizationId,
    })
    await qc.invalidateQueries({ queryKey: ["workspace"] })
    toast.success(`Welcome to ${inv.organizationName}`)
    router.push(`/${inv.organizationSlug}`)
  }
  const decline = async () => {
    setBusy("decline")
    const { error } = await authClient.organization.rejectInvitation({
      invitationId,
    })
    setBusy(null)
    if (error) {
      toast.error(error.message ?? "Could not decline the invitation")
      return
    }
    toast.success("Invitation declined")
    router.push("/")
  }

  return (
    <AuthCard
      title={`Join ${inv.organizationName}`}
      description={`${inv.inviterEmail} invited you to collaborate on Billleaf.`}
    >
      <Button onClick={accept} disabled={busy !== null}>
        {busy === "accept" ? "Joining…" : "Accept invitation"}
      </Button>
      <Button variant="outline" onClick={decline} disabled={busy !== null}>
        {busy === "decline" ? "Declining…" : "Decline"}
      </Button>
    </AuthCard>
  )
}
