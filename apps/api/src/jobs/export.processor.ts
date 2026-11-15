import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import type { Job } from "bullmq"
import { ClsService } from "nestjs-cls"

import type { RequestContextStore } from "../common/context/request-context.js"
import { QUEUES } from "../core/queue/queue.module.js"
import {
  DataExportService,
  type ExportJob,
} from "../modules/data-export/data-export.service.js"

/** Builds full data exports one at a time, each in its workspace's context. */
@Processor(QUEUES.exports, { concurrency: 1 })
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name)

  constructor(
    private readonly cls: ClsService<RequestContextStore>,
    private readonly exports: DataExportService
  ) {
    super()
  }

  async process(job: Job<ExportJob>) {
    return this.cls.run(async () => {
      this.cls.set("workspaceId", job.data.workspaceId)
      this.cls.set("userId", job.data.userId)
      const result = await this.exports.build(job.data)
      this.logger.log(
        { workspaceId: job.data.workspaceId, ...result },
        "Data export ready"
      )
      return result
    })
  }
}
