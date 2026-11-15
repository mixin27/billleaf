import pg from "pg"

import { runMigrations } from "./migrate.js"

/**
 * Create the database if missing, wipe it and apply all migrations.
 * TEST ONLY — refuses any database whose name does not end in `_test`.
 */
export async function resetTestDatabase(url: string) {
  const target = new URL(url)
  const dbName = target.pathname.slice(1)
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `resetTestDatabase refuses to touch non-test database "${dbName}"`
    )
  }

  const admin = new URL(target)
  admin.pathname = "/postgres"
  const adminClient = new pg.Client({ connectionString: admin.toString() })
  await adminClient.connect()
  try {
    const exists = await adminClient.query(
      "select 1 from pg_database where datname = $1",
      [dbName]
    )
    if (exists.rowCount === 0)
      await adminClient.query(`create database "${dbName}"`)
  } finally {
    await adminClient.end()
  }

  const client = new pg.Client({ connectionString: target.toString() })
  await client.connect()
  try {
    await client.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;"
    )
  } finally {
    await client.end()
  }

  await runMigrations(target.toString())
}
