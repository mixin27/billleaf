import { Controller, Get } from "@nestjs/common"
import {
  HealthCheck,
  type HealthIndicatorResult,
  HealthCheckService,
  HealthIndicatorService,
} from "@nestjs/terminus"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import { sql } from "drizzle-orm"
import type { Redis } from "ioredis"

import { InjectRedis } from "../core/cache/redis.module.js"
import { InjectDb, type Database } from "../core/database/database.module.js"

@Controller("health")
@AllowAnonymous()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    @InjectDb() private readonly db: Database,
    @InjectRedis() private readonly redis: Redis
  ) {}

  /** Liveness: the process is up. */
  @Get("live")
  live() {
    return { status: "ok" }
  }

  /** Readiness: dependencies reachable. Used by Dokploy/Traefik health checks. */
  @Get()
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.check("database", () => this.db.execute(sql`select 1`)),
      () =>
        this.check("redis", async () => {
          if (this.redis.status === "wait") await this.redis.connect()
          await this.redis.ping()
        }),
    ])
  }

  private async check(
    key: string,
    fn: () => Promise<unknown>
  ): Promise<HealthIndicatorResult> {
    const ind = this.indicator.check(key)
    try {
      await fn()
      return ind.up()
    } catch (err) {
      return ind.down({ message: (err as Error).message })
    }
  }
}
