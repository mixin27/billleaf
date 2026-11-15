import { fileURLToPath } from "node:url"

import { migrate } from "drizzle-orm/node-postgres/migrator"

import { createDb } from "./client.js"

/** Folder shipped with this package (`packages/db/migrations`). */
export const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../migrations", import.meta.url)
)

/** Apply pending migrations. Used by `pnpm db:migrate` and the prod `migrate` job. */
export async function runMigrations(url: string) {
  const { db, pool } = createDb({ url, max: 1, applicationName: "migrate" })
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await pool.end()
  }
}
