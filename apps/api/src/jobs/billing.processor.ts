import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq"
import type { OnApplicationBootstrap } from "@nestjs/common"
import type { Job, Queue } from "bullmq"

import { BillingService } from "../billing/billing.service.js"
import { SubscriptionRemindersService } from "../billing/manual/subscription-reminders.service.js"
import { QUEUES } from "../core/queue/queue.module.js"

/**
 * Billing queue: retries events that failed to apply on receipt
 * (exponential backoff), and the hourly renewal-reminder sweep for manual
 * plans.
 */
@Processor(QUEUES.billing)
export class BillingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  constructor(
    @InjectQueue(QUEUES.billing) private readonly queue: Queue,
    private readonly billing: BillingService,
    private readonly reminders: SubscriptionRemindersService
  ) {
    super()
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "subscription-reminders",
      { pattern: "20 * * * *" },
      { name: "reminders", opts: { attempts: 1 } }
    )
  }

  async process(job: Job<{ eventRowId: string }>) {
    if (job.name === "reminders") {
      await this.reminders.run()
      return
    }
    await this.billing.retry(job.data.eventRowId)
  }
}
