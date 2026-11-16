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
    // Fail fast (and retry) instead of hanging past the job lock: a slow
    // DNS lookup or an unresponsive server otherwise stalls the queue.
    this.transport = nodemailer.createTransport({
      url: env.SMTP_URL,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      dnsTimeout: 10_000,
    })
  }

  async process(job: Job<EmailMessage>) {
    const { to, subject, html, text, replyTo, attachments } = job.data
    await this.transport.sendMail({
      from: this.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, "base64"),
        contentType: a.contentType,
      })),
    })
    this.logger.log(`Sent "${subject}" to ${to}`)
  }
}
