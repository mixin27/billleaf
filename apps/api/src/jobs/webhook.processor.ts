import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger, type OnApplicationBootstrap } from "@nestjs/common"
import type { Job, Queue } from "bullmq"

import { QUEUES } from "../core/queue/queue.module.js"
import { WebhookDeliveryService } from "../modules/webhooks/webhook-delivery.service.js"
import { WebhooksService } from "../modules/webhooks/webhooks.service.js"

/**
 * Webhook deliveries (`deliver`, one per endpoint and event, retried with
 * backoff by BullMQ) and a daily `prune` of deliveries older than 30 days.
 */
@Processor(QUEUES.webhooks, { concurrency: 5 })
export class WebhookProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(WebhookProcessor.name)

  constructor(
    @InjectQueue(QUEUES.webhooks) private readonly queue: Queue,
    private readonly deliveries: WebhookDeliveryService,
    private readonly webhooks: WebhooksService
  ) {
    super()
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "webhook-prune",
      { pattern: "15 3 * * *" },
      { name: "prune", opts: { attempts: 1 } }
    )
  }

  async process(job: Job<{ deliveryId?: string }>) {
    if (job.name === "prune") {
      const n = await this.webhooks.prune()
      if (n) this.logger.log(`Pruned ${n} old webhook deliveries`)
      return
    }
    const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    const result = await this.deliveries.attempt(job.data.deliveryId!, last)
    // Throwing makes BullMQ retry with backoff.
    if (result === "retry") throw new Error("Webhook delivery failed")
  }
}
