import { Processor, WorkerHost } from "@nestjs/bullmq"
import type { Job } from "bullmq"

import { BillingService } from "../billing/billing.service.js"
import { QUEUES } from "../core/queue/queue.module.js"

/** Retries billing events that failed to apply on receipt (exponential backoff). */
@Processor(QUEUES.billing)
export class BillingProcessor extends WorkerHost {
  constructor(private readonly billing: BillingService) {
    super()
  }

  async process(job: Job<{ eventRowId: string }>) {
    await this.billing.retry(job.data.eventRowId)
  }
}
