import { PERMISSIONS } from "@workspace/contracts"
import { notInArray, sql } from "drizzle-orm"

import type { Database } from "./client.js"
import { permissions } from "./schema/index.js"

/**
 * Upsert the code-defined permission catalog into the `permissions` table
 * and delete keys that no longer exist. Idempotent; run on deploy/boot.
 */
export async function syncPermissions(db: Database) {
  const keys = PERMISSIONS.map((p) => p.key)
  await db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(PERMISSIONS.map((p) => ({ ...p })))
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          resource: sql`excluded.resource`,
          action: sql`excluded.action`,
          description: sql`excluded.description`,
        },
      })
    await tx.delete(permissions).where(notInArray(permissions.key, keys))
  })
  return { synced: keys.length }
}
