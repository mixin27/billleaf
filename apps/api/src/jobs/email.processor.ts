import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Inject, Logger } from "@nestjs/common"
import type { EmailMessage } from "@workspace/emails"
import type { Job } from "bullmq"
import nodemailer, { type Transporter } from "nodemailer"

import { ENV, type Env } from "../core/config/env.js"
import { QUEUES } from "../core/queue/queue.module.js"

@Processor(QUEUES.email)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name)
  private readonly transport: Transporter

  constructor(@Inject(ENV) private readonly env: Env) {
    super()
    this.transport = nodemailer.createTransport(env.SMTP_URL)
  }

  async process(job: Job<EmailMessage>) {
    const { to, subject, html, text } = job.data
    await this.transport.sendMail({
      from: this.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    })
    this.logger.log(`Sent "${subject}" to ${to}`)
  }
}
