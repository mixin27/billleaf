import { createDb } from "../src/client.js"
import { syncPermissions } from "../src/permissions-sync.js"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required")

const { db, pool } = createDb({ url, max: 1, applicationName: "seed" })
const { synced } = await syncPermissions(db)
console.log(`✔ synced ${synced} permissions`)
await pool.end()
