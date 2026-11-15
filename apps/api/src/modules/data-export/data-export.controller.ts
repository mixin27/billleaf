import { Controller, HttpCode, Post } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import { z } from "zod"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { DataExportService } from "./data-export.service.js"

class ExportQueuedDto extends createZodDto(
  z.object({ queued: z.literal(true) })
) {}

@ApiTags("workspace")
@Controller({ path: "workspace", version: "1" })
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  /**
   * Everything plus document PDFs, built in the background and emailed to
   * you as a download link (valid 3 days).
   */
  @Post("export/full")
  @HttpCode(202)
  @RequirePermission("workspace.export")
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ZodResponse({ status: 202, type: ExportQueuedDto })
  request() {
    return this.exports.request()
  }
}
