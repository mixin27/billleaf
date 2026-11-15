import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import pg from "pg"

import * as schema from "./schema/index.js"

export type Database = NodePgDatabase<typeof schema>
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export interface CreateDbOptions {
  url: string
  max?: number
  applicationName?: string
}

export function createDb({ url, max = 10, applicationName }: CreateDbOptions) {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    application_name: applicationName,
  })
  const db = drizzle({ client: pool, schema, casing: "snake_case" })
  return { db, pool }
}
export type DbConnection = ReturnType<typeof createDb>
