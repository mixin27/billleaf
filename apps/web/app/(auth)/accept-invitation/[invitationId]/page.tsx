import type { Metadata } from "next"

import { AcceptInvitation } from "@/features/auth"

export const metadata: Metadata = { title: "Invitation" }

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>
}) {
  const { invitationId } = await params
  return <AcceptInvitation invitationId={invitationId} />
}
