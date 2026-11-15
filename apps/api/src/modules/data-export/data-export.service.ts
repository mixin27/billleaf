import { randomUUID } from "node:crypto"

import { InjectQueue } from "@nestjs/bullmq"
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { dataExportReadyEmail } from "@workspace/emails"
import {
  contracts,
  invoices,
  organization,
  quotes,
  receipts,
  user,
} from "@workspace/db"
import type { Queue } from "bullmq"
import { and, eq, ne } from "drizzle-orm"
import { strToU8, zipSync } from "fflate"

import { RequestContext } from "../../common/context/request-context.js"
import { ENV, type Env } from "../../core/config/env.js"
import { InjectDb, type Database } from "../../core/database/database.module.js"
import { QUEUES } from "../../core/queue/queue.module.js"
import { StorageService } from "../../core/storage/storage.service.js"
import { AuditService } from "../../iam/audit/audit.service.js"
import { MailService } from "../../mail/mail.service.js"
import { ContractsService } from "../contracts/contracts.service.js"
import { InvoicesService } from "../invoices/invoices.service.js"
import { PaymentsService } from "../payments/payments.service.js"
import { QuotesService } from "../quotes/quotes.service.js"
import { WorkspaceDataService } from "../workspace/workspace-data.service.js"

/** How long the emailed download link works (S3 presigned URLs max out at 7 days). */
export const EXPORT_LINK_DAYS = 3

export interface ExportJob {
  workspaceId: string
  userId: string
}

/** Keep generated names inside their folder in the ZIP. */
const safe = (name: string) => name.replace(/[^\w.-]+/g, "_")

/**
 * The full export: the CSVs plus a PDF of every non-draft invoice, quote,
 * receipt and contract. Built by the worker (it can take a while), stored
 * privately under `<workspace>/exports/`, and emailed as a time-limited link
 * to the owner who asked. Only the latest export is kept.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name)

  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(QUEUES.exports) private readonly queue: Queue<ExportJob>,
    private readonly ctx: RequestContext,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly data: WorkspaceDataService,
    private readonly invoicesService: InvoicesService,
    private readonly quotesService: QuotesService,
    private readonly payments: PaymentsService,
    private readonly contractsService: ContractsService
  ) {}

  /** Queue an export for the current workspace (one at a time per workspace). */
  async request() {
    const workspaceId = this.ctx.workspaceId
    await this.queue.add(
      "full-export",
      { workspaceId, userId: this.ctx.userId },
      { deduplication: { id: `export-${workspaceId}` }, attempts: 2 }
    )
    await this.audit.record("workspace.export_requested", {
      metadata: { withPdfs: true },
    })
    return { queued: true as const }
  }

  /** Worker: build, store and email the export. Runs in the workspace's context. */
  async build(job: ExportJob) {
    const ws = job.workspaceId
    const [requester] = await this.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, job.userId))
    const [org] = await this.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, ws))
    if (!requester || !org)
      throw new NotFoundException("Export no longer needed")

    const { name, files } = await this.data.csvFiles()
    const errors: string[] = []
    let documents = 0
    const add = async (
      folder: string,
      ids: string[],
      render: (id: string) => Promise<{ filename: string; content: Buffer }>
    ) => {
      for (const id of ids) {
        try {
          const { filename, content } = await render(id)
          files[`pdfs/${folder}/${safe(filename)}`] = new Uint8Array(content)
          documents++
        } catch (err) {
          errors.push(`${folder} ${id}: ${(err as Error).message}`)
        }
      }
    }
    const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id)

    await add(
      "invoices",
      ids(
        await this.db
          .select({ id: invoices.id })
          .from(invoices)
          .where(
            and(eq(invoices.workspaceId, ws), ne(invoices.status, "draft"))
          )
      ),
      (id) => this.invoicesService.pdf(id)
    )
    await add(
      "quotes",
      ids(
        await this.db
          .select({ id: quotes.id })
          .from(quotes)
          .where(and(eq(quotes.workspaceId, ws), ne(quotes.status, "draft")))
      ),
      (id) => this.quotesService.pdf(id)
    )
    await add(
      "receipts",
      (
        await this.db
          .select({ id: receipts.paymentId })
          .from(receipts)
          .where(eq(receipts.workspaceId, ws))
      ).map((r) => r.id),
      (paymentId) => this.payments.receiptPdf(paymentId)
    )
    await add(
      "contracts",
      ids(
        await this.db
          .select({ id: contracts.id })
          .from(contracts)
          .where(
            and(eq(contracts.workspaceId, ws), ne(contracts.status, "draft"))
          )
      ),
      (id) => this.contractsService.pdf(id)
    )
    if (errors.length)
      files["pdfs/ERRORS.txt"] = strToU8(
        `These documents couldn't be rendered:\n\n${errors.join("\n")}\n`
      )

    const body = Buffer.from(zipSync(files, { level: 6 }))
    // Keep only the newest export.
    await this.storage
      .deletePrefix(`${ws}/exports/`)
      .catch((err) => this.logger.warn({ err }, "Old exports not removed"))
    const key = `${ws}/exports/${randomUUID()}/${name}-with-pdfs.zip`
    await this.storage.put(key, body, "application/zip")
    const seconds = EXPORT_LINK_DAYS * 86_400
    const url = await this.storage.presignGet(key, seconds)
    await this.mail.send(
      dataExportReadyEmail({
        to: requester.email,
        workspaceName: org.name,
        url,
        expires: new Date(Date.now() + seconds * 1000)
          .toISOString()
          .slice(0, 10),
        documents,
      })
    )
    await this.audit.record("workspace.exported", {
      metadata: { withPdfs: true, documents, errors: errors.length },
    })
    return { documents, errors: errors.length, bytes: body.length }
  }
}
