import { InjectQueue } from "@nestjs/bullmq"
import { Inject, Injectable, Logger } from "@nestjs/common"
import type { Queue } from "bullmq"

import { QUEUES } from "../../core/queue/queue.module.js"
import { NotificationsRepository } from "./notifications.repository.js"
import type { PushJob } from "./notifications.service.js"
import {
  PUSH_PROVIDER,
  type PushProvider,
  type PushTicket,
} from "./push.provider.js"

/** Expo's receipts are ready after a few minutes; check after 15. */
export const RECEIPT_DELAY_MS = 15 * 60_000

const GONE = "DeviceNotRegistered"

/**
 * The worker side of push: send a queued push to its tokens, then check
 * the delivery receipts later and forget tokens whose app is gone.
 */
@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name)

  constructor(
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly repo: NotificationsRepository,
    @InjectQueue(QUEUES.push) private readonly queue: Queue
  ) {}

  async send(job: PushJob): Promise<PushTicket[]> {
    const tickets = await this.provider.send(
      job.tokens.map((to) => ({
        to,
        title: job.title,
        body: job.body,
        data: job.data,
      }))
    )
    const gone = tickets.filter((t) => t.error === GONE).map((t) => t.token)
    const removed = await this.repo.deleteTokens(gone)
    if (removed) this.logger.log(`Removed ${removed} unregistered push tokens`)
    const other = tickets.filter((t) => t.error && t.error !== GONE)
    if (other.length)
      this.logger.warn(
        { errors: other.map((t) => t.error) },
        "Some push notifications were refused"
      )
    const pending = tickets.filter((t) => t.id)
    if (pending.length)
      await this.queue.add(
        "receipts",
        { tickets: pending.map((t) => ({ id: t.id!, token: t.token })) },
        { delay: RECEIPT_DELAY_MS, attempts: 3 }
      )
    return tickets
  }

  /** Forget tokens Expo couldn't deliver to because the app is gone. */
  async checkReceipts(tickets: { id: string; token: string }[]) {
    const receipts = await this.provider.receipts(tickets.map((t) => t.id))
    const gone = tickets
      .filter((t) => receipts[t.id]?.error === GONE)
      .map((t) => t.token)
    const removed = await this.repo.deleteTokens(gone)
    if (removed) this.logger.log(`Removed ${removed} unregistered push tokens`)
  }
}
