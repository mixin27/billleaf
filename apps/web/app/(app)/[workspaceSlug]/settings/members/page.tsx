import type { Metadata } from "next"

import { MembersManager } from "@/features/members"

export const metadata: Metadata = { title: "Members" }

export default function MembersPage() {
  return <MembersManager />
}
