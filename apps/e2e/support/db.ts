import {
  createDb,
  member,
  organization,
  user,
  workspaceSubscriptions,
} from "@workspace/db"
import { eq } from "drizzle-orm"

import { DATABASE_URL } from "./env"

/**
 * Direct database access for test setup only (what a real user would do
 * through billing or an inbox): verify an email, change a plan.
 */
let conn: ReturnType<typeof createDb> | undefined
function db() {
  conn ??= createDb({ url: DATABASE_URL, max: 2 })
  return conn.db
}

export async function markEmailVerified(email: string) {
  await db()
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email.toLowerCase()))
}

export async function setPlan(slug: string, planKey: "free" | "pro" | "team") {
  const [ws] = await db()
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
  if (!ws) throw new Error(`No workspace ${slug}`)
  await db()
    .update(workspaceSubscriptions)
    .set({ planKey })
    .where(eq(workspaceSubscriptions.workspaceId, ws.id))
}

export async function memberCount(slug: string) {
  const rows = await db()
    .select({ id: member.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(organization.slug, slug))
  return rows.length
}
