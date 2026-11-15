import { randomUUID, timingSafeEqual } from "node:crypto"

import { InjectQueue } from "@nestjs/bullmq"
import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common"
import { ApiExcludeEndpoint } from "@nestjs/swagger"
import {
  HealthCheck,
  type HealthIndicatorResult,
  HealthCheckService,
  HealthIndicatorService,
} from "@nestjs/terminus"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import type { Queue } from "bullmq"
import type { FastifyReply } from "fastify"
import { sql } from "drizzle-orm"
import type { Redis } from "ioredis"

import { InjectRedis } from "../core/cache/redis.module.js"
import { ENV, type Env } from "../core/config/env.js"
import { InjectDb, type Database } from "../core/database/database.module.js"
import { QUEUES } from "../core/queue/queue.module.js"
import { StorageService } from "../core/storage/storage.service.js"
import { WORKER_HEARTBEAT_KEY } from "../jobs/worker-heartbeat.js"
import { createPdf } from "../modules/documents/document-pdf.js"

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

@Controller("health")
@AllowAnonymous()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    @InjectDb() private readonly db: Database,
    @InjectRedis() private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly storage: StorageService,
    @InjectQueue(QUEUES.email) private readonly emailQueue: Queue
  ) {}

  /** Liveness: the process is up (and which build it runs). */
  @Get("live")
  live() {
    return { status: "ok", version: this.env.APP_VERSION }
  }

  /** Readiness: dependencies reachable. Used by Dokploy/Traefik health checks. */
  @Get()
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.check("database", () => this.db.execute(sql`select 1`)),
      () => this.check("redis", () => this.pingRedis()),
    ])
  }

  /**
   * Post-deploy smoke check (scripts/smoke.sh). Disabled unless
   * HEALTH_CHECK_TOKEN is set; needs the token in `x-health-token`.
   * Exercises everything a user action touches, without business data:
   * database, Redis, object storage (write/read/delete), PDF rendering,
   * the job queue and a live worker.
   */
  @Get("deep")
  @ApiExcludeEndpoint()
  async deep(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers("x-health-token") token?: string
  ) {
    const expected = this.env.HEALTH_CHECK_TOKEN
    if (!expected || !token || !sameToken(token, expected))
      throw new NotFoundException()
    // Return the per-check details with a 503 (the error filter would
    // otherwise replace them with a generic problem body).
    try {
      return await this.runDeep()
    } catch (e) {
      if (!(e instanceof ServiceUnavailableException)) throw e
      void reply.code(503)
      return e.getResponse()
    }
  }

  private runDeep() {
    return this.health.check([
      () => this.check("database", () => this.db.execute(sql`select 1`)),
      () => this.check("redis", () => this.pingRedis()),
      () =>
        this.check("storage", async () => {
          const key = `_health/${randomUUID()}.txt`
          const body = Buffer.from(`ok ${new Date().toISOString()}`)
          await this.storage.put(key, body, "text/plain")
          try {
            const back = await this.storage.get(key)
            if (!back.equals(body)) throw new Error("read back different bytes")
          } finally {
            await this.storage.delete(key)
          }
        }),
      () =>
        this.check("pdf", async () => {
          const { doc, done, write } = createPdf("Health check")
          write("Health check", 50, 50, {}, { bold: true, size: 12 })
          doc.end()
          const pdf = await done
          if (pdf.subarray(0, 4).toString() !== "%PDF")
            throw new Error("not a PDF")
        }),
      () =>
        this.check("queue", async () => {
          await this.emailQueue.getJobCounts("waiting", "active", "failed")
        }),
      () =>
        this.check("worker", async () => {
          const at = await this.redis.get(WORKER_HEARTBEAT_KEY)
          if (!at) throw new Error("no heartbeat in the last 90 seconds")
        }),
    ])
  }

  private async pingRedis() {
    if (this.redis.status === "wait") await this.redis.connect()
    await this.redis.ping()
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
