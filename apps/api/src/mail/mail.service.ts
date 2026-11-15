import { InjectQueue } from "@nestjs/bullmq"
import { Injectable } from "@nestjs/common"
import type { EmailMessage } from "@workspace/emails"
import type { Queue } from "bullmq"

import { QUEUES } from "../core/queue/queue.module.js"

/** Enqueues outgoing email; the worker renders transport delivery. */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(QUEUES.email) private readonly queue: Queue<EmailMessage>
  ) {}

  async send(message: EmailMessage) {
    await this.queue.add("send", message)
  }
}
