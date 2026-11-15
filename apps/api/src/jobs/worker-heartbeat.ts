import { writeFile } from "node:fs/promises"

import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common"
import type { Redis } from "ioredis"

import { InjectRedis } from "../core/cache/redis.module.js"

export const WORKER_HEARTBEAT_KEY = "billleaf:worker:heartbeat"
export const WORKER_HEARTBEAT_FILE = "/tmp/worker-heartbeat"
const EVERY_MS = 30_000

/**
 * Proves the worker is alive: a Redis key (read by /health/deep) and a file
 * (read by the container health check), refreshed every 30 seconds.
 */
@Injectable()
export class WorkerHeartbeat implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerHeartbeat.name)
  private timer?: NodeJS.Timeout

  constructor(@InjectRedis() private readonly redis: Redis) {}

  onModuleInit() {
    void this.beat()
    this.timer = setInterval(() => void this.beat(), EVERY_MS)
    this.timer.unref()
  }

  onApplicationShutdown() {
    clearInterval(this.timer)
  }

  private async beat() {
    const now = new Date().toISOString()
    try {
      await this.redis.set(WORKER_HEARTBEAT_KEY, now, "EX", 90)
      await writeFile(WORKER_HEARTBEAT_FILE, now)
    } catch (err) {
      this.logger.warn(`Heartbeat failed: ${(err as Error).message}`)
    }
  }
}
