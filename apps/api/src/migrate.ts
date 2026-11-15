/** Production migration entrypoint (`node apps/api/dist/migrate.js`). */
import { runMigrations, syncPermissions, createDb } from "@workspace/db"

import { loadEnv } from "./core/config/env.js"

const env = loadEnv()
await runMigrations(env.DATABASE_URL)
const { db, pool } = createDb({ url: env.DATABASE_URL, max: 1 })
await syncPermissions(db)
await pool.end()
console.log("✔ migrations applied and permissions synced")
