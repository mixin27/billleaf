import { Processor, WorkerHost } from "@nestjs/bullmq"
import type { Job } from "bullmq"

import { QUEUES } from "../core/queue/queue.module.js"
import type { PushJob } from "../modules/notifications/notifications.service.js"
import { PushDeliveryService } from "../modules/notifications/push-delivery.service.js"

/**
 * Push notifications (`send`, retried by BullMQ if Expo can't be reached)
 * and, 15 minutes later, their delivery `receipts`.
 */
@Processor(QUEUES.push, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  constructor(private readonly delivery: PushDeliveryService) {
    super()
  }

  async process(
    job: Job<PushJob | { tickets: { id: string; token: string }[] }>
  ) {
    if (job.name === "receipts")
      return this.delivery.checkReceipts(
        (job.data as { tickets: { id: string; token: string }[] }).tickets
      )
    await this.delivery.send(job.data as PushJob)
  }
}
