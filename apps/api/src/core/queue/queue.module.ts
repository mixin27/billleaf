import { BullModule } from "@nestjs/bullmq"
import { Global, Module } from "@nestjs/common"

import { ConfigModule } from "../config/config.module.js"
import { ENV, type Env } from "../config/env.js"

export const QUEUES = {
  email: "email",
  recurring: "recurring",
  billing: "billing",
  /** Long-running data exports (ZIP with PDFs), emailed when ready. */
  exports: "exports",
} as const

/**
 * BullMQ connection. Producers (API) and consumers (worker) both import this;
 * processors are only registered in `WorkerModule`.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUES.email },
      { name: QUEUES.recurring },
      { name: QUEUES.billing },
      { name: QUEUES.exports }
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
