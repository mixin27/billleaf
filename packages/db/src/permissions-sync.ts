import { PERMISSIONS } from "@workspace/contracts"
import { notInArray, sql } from "drizzle-orm"

import type { Database } from "./client.js"
import { permissions } from "./schema/index.js"

/**
 * Upsert the code-defined permission catalog into the `permissions` table
 * and delete keys that no longer exist, then grant every key to locked
 * (Owner) roles. Idempotent; run on deploy/boot.
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
    // Locked roles (Owner) hold every permission, including keys added later.
    await tx.execute(sql`
      INSERT INTO role_permissions (role_id, permission_key)
      SELECT r.id, p.key FROM roles r CROSS JOIN permissions p
      WHERE r.is_locked
      ON CONFLICT DO NOTHING`)
  })
  return { synced: keys.length }
}
