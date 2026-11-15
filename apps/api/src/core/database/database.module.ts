import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common"
import { createDb, type Database, type DbConnection } from "@workspace/db"

import { ENV, type Env } from "../config/env.js"

export const DB = Symbol("DB")
export const DB_POOL = Symbol("DB_POOL")
export type { Database }

/** Inject the Drizzle client: `constructor(@InjectDb() private db: Database)` */
export const InjectDb = () => Inject(DB)

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ENV],
      useFactory: (env: Env) =>
        createDb({ url: env.DATABASE_URL, applicationName: "billleaf-api" }),
    },
    {
      provide: DB,
      inject: [DB_POOL],
      useFactory: ({ db }: DbConnection) => db,
    },
  ],
  exports: [DB, DB_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly conn: DbConnection) {}

  async onApplicationShutdown() {
    await this.conn.pool.end()
  }
}
