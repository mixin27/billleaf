/**
 * The API side of the e2e stack, started by Playwright (webServer) before
 * any test: a fresh `*_e2e_test` database (migrations + permission catalog),
 * then the worker (emails, PDFs) and the API from apps/api/dist. Stops both
 * when Playwright stops it. Run with Node's built-in TypeScript support.
 */
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

import { createDb, syncPermissions } from "@workspace/db"
import { resetTestDatabase } from "@workspace/db/testing"

import { apiEnv, DATABASE_URL } from "./env.ts"

const API_DIR = fileURLToPath(new URL("../../api/", import.meta.url))

await resetTestDatabase(DATABASE_URL)
const { db, pool } = createDb({ url: DATABASE_URL })
await syncPermissions(db)
await pool.end()

const start = (entry: string) =>
  spawn(process.execPath, ["--import", "./dist/instrument.js", entry], {
    cwd: API_DIR,
    env: { ...process.env, ...apiEnv },
    stdio: "inherit",
  })
const children = [start("dist/worker.js"), start("dist/main.js")]

const stop = () => {
  for (const c of children) c.kill("SIGTERM")
  setTimeout(() => process.exit(0), 5_000).unref()
}
process.on("SIGTERM", stop)
process.on("SIGINT", stop)
for (const c of children)
  c.on("exit", (code) => {
    if (code) {
      console.error(`e2e stack: a process exited with ${code}`)
      stop()
      process.exitCode = code
    }
  })
