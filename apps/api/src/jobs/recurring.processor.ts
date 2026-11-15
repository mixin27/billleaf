import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger, type OnApplicationBootstrap } from "@nestjs/common"
import type { Job, Queue } from "bullmq"
import { ClsService } from "nestjs-cls"

import type { RequestContextStore } from "../common/context/request-context.js"
import { QUEUES } from "../core/queue/queue.module.js"
import { addDays } from "../modules/documents/party-snapshot.js"
import { InvoiceRemindersService } from "../modules/invoices/invoice-reminders.service.js"
import { RecurringRepository } from "../modules/recurring/recurring.repository.js"
import { RecurringService } from "../modules/recurring/recurring.service.js"

/**
 * Hourly sweeps on the recurring queue:
 * - generate due recurring invoices. Each schedule runs in its own workspace
 *   context so tenant scoping applies; generation is idempotent, so
 *   overlapping or retried sweeps are safe;
 * - send payment reminders for unpaid invoices (`invoice-reminders` job,
 *   see InvoiceRemindersService).
 */
@Processor(QUEUES.recurring, { concurrency: 1 })
export class RecurringProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(RecurringProcessor.name)

  constructor(
    @InjectQueue(QUEUES.recurring) private readonly queue: Queue,
    private readonly cls: ClsService<RequestContextStore>,
    private readonly repo: RecurringRepository,
    private readonly recurring: RecurringService,
    private readonly reminders: InvoiceRemindersService
  ) {
    super()
  }

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "recurring-sweep",
      { pattern: "5 * * * *" },
      { name: "sweep", opts: { attempts: 1 } }
    )
    // Payment reminders for unpaid invoices (idempotent, hourly).
    await this.queue.upsertJobScheduler(
      "invoice-reminders",
      { pattern: "35 * * * *" },
      { name: "invoice-reminders", opts: { attempts: 1 } }
    )
  }

  async process(job: Job) {
    if (job.name === "invoice-reminders") {
      await this.reminders.run()
      return
    }
    // UTC tomorrow covers every timezone; the service re-checks per workspace.
    const latest = addDays(new Date().toISOString().slice(0, 10), 1)
    const due = await this.repo.dueAcrossWorkspaces(latest)
    let generated = 0
    for (const s of due) {
      await this.cls.run(async () => {
        this.cls.set("workspaceId", s.workspaceId)
        try {
          generated += await this.recurring.generateDue(s.id)
        } catch (err) {
          this.logger.error(
            { err, recurringId: s.id },
            "Recurring generation failed"
          )
        }
      })
    }
    if (generated)
      this.logger.log(`Generated ${generated} recurring invoice(s)`)
    return { checked: due.length, generated }
  }
}
