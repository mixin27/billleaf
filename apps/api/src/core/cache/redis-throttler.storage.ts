import { Logger } from "@nestjs/common"
import type { ThrottlerStorage } from "@nestjs/throttler"
import type { Redis } from "ioredis"

/**
 * One atomic step: if blocked, report the block; otherwise count the hit in
 * a fixed window and start a block when the limit is passed.
 * KEYS: hits, block. ARGV: window ms, limit, block ms.
 * Returns { hits, window ms left, blocked (0/1), block ms left }.
 */
const SCRIPT = `
local blockLeft = redis.call('PTTL', KEYS[2])
if blockLeft > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, math.max(redis.call('PTTL', KEYS[1]), 0), 1, blockLeft }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local left = redis.call('PTTL', KEYS[1])
if left < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  left = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, left, 1, tonumber(ARGV[3]) }
end
return { hits, left, 0, 0 }
`

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage["increment"]>>

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000))

/**
 * Rate-limit counters in Redis/Valkey, so every API instance shares them
 * (the default store is per process). If Redis is unreachable the request
 * is let through rather than failing the API.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name)

  constructor(
    private readonly redis: Redis,
    private readonly prefix = "throttle"
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const base = `${this.prefix}:${throttlerName}:${key}`
    try {
      const [hits, left, blocked, blockLeft] = (await this.redis.eval(
        SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        blockDuration || ttl
      )) as [number, number, number, number]
      return {
        totalHits: hits,
        timeToExpire: seconds(left),
        isBlocked: blocked === 1,
        timeToBlockExpire: seconds(blockLeft),
      }
    } catch (err) {
      this.logger.warn(
        { err },
        "Rate limit store unavailable; allowing request"
      )
      return {
        totalHits: 0,
        timeToExpire: seconds(ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      }
    }
  }
}
