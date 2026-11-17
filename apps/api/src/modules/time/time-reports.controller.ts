import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  ParseUUIDPipe,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  clockifyImportOptionsSchema,
  clockifyImportResultSchema,
  timeImportBatchListSchema,
  timeImportSourceSchema,
  undoTimeImportResultSchema,
  detailedReportQuerySchema,
  detailedReportSchema,
  reportFiltersSchema,
  setTimesheetCellSchema,
  summaryReportQuerySchema,
  summaryReportSchema,
  timesheetQuerySchema,
  timesheetSchema,
} from "@workspace/contracts"
import type { FastifyReply, FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequireWorkspace } from "../../common/decorators/require-permission.decorator.js"
import { ClockifyImportService } from "./clockify-import.service.js"
import { TimeReportsService } from "./time-reports.service.js"
import { TimeService } from "./time.service.js"

class TimesheetQueryDto extends createZodDto(timesheetQuerySchema) {}
class TimesheetDto extends createZodDto(timesheetSchema) {}
class SetTimesheetCellDto extends createZodDto(setTimesheetCellSchema) {}
class SummaryReportQueryDto extends createZodDto(summaryReportQuerySchema) {}
class SummaryReportDto extends createZodDto(summaryReportSchema) {}
class DetailedReportQueryDto extends createZodDto(detailedReportQuerySchema) {}
class DetailedReportDto extends createZodDto(detailedReportSchema) {}
class ReportCsvQueryDto extends createZodDto(reportFiltersSchema) {}
class ClockifyImportOptionsDto extends createZodDto(
  clockifyImportOptionsSchema
) {}
class TimeImportBatchListDto extends createZodDto(timeImportBatchListSchema) {}
class UndoTimeImportResultDto extends createZodDto(
  undoTimeImportResultSchema
) {}
class ClockifyImportResultDto extends createZodDto(
  clockifyImportResultSchema
) {}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

/** Timesheet grid, reports and imports. Permission rules live in the services. */
@ApiTags("time")
@Controller({ path: "time", version: "1" })
@RequireWorkspace()
export class TimeReportsController {
  constructor(
    private readonly time: TimeService,
    private readonly reports: TimeReportsService,
    private readonly clockify: ClockifyImportService
  ) {}

  @Get("timesheet")
  @ZodResponse({ status: 200, type: TimesheetDto })
  timesheet(@Query() q: TimesheetQueryDto) {
    return this.time.timesheet(q.week, q.memberId)
  }

  @Put("timesheet/cell")
  @ZodResponse({ status: 200, type: TimesheetDto })
  setCell(@Body() body: SetTimesheetCellDto) {
    return this.time.setTimesheetCell(body as never)
  }

  @Get("reports/summary")
  @ZodResponse({ status: 200, type: SummaryReportDto })
  summary(@Query() q: SummaryReportQueryDto) {
    return this.reports.summary(q as never)
  }

  @Get("reports/detailed")
  @ZodResponse({ status: 200, type: DetailedReportDto })
  detailed(@Query() q: DetailedReportQueryDto) {
    return this.reports.detailed(q as never)
  }

  /** Same filters as the detailed report; every matching row (≤ 50,000). */
  @Get("reports/detailed.csv")
  @Header("cache-control", "private, no-store")
  async detailedCsv(@Query() q: ReportCsvQueryDto, @Res() reply: FastifyReply) {
    const csv = await this.reports.detailedCsv(q as never)
    const name = `time-${(q as { from: string }).from}-to-${(q as { to: string }).to}.csv`
    void reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${name}"`)
      .send(csv)
  }

  /** Past imports, newest first (time.manage). */
  @Get("imports")
  @ZodResponse({ status: 200, type: TimeImportBatchListDto })
  async imports() {
    return { items: await this.clockify.history() }
  }

  /** Remove an import's entries (invoiced or locked ones are kept). */
  @Post("imports/:id/undo")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: UndoTimeImportResultDto })
  undoImport(@Param("id", ParseUUIDPipe) id: string) {
    return this.clockify.undo(id)
  }

  /**
   * multipart/form-data with a `file` field: a detailed CSV export (≤ 10 MB)
   * from Clockify, Toggl Track or Harvest. `?dryRun=true` previews without
   * writing anything.
   */
  @Post("import/:source")
  @ZodResponse({ status: 201, type: ClockifyImportResultDto })
  async importTime(
    @Param("source") sourceParam: string,
    @Req() req: FastifyRequest,
    @Query() q: ClockifyImportOptionsDto
  ) {
    const source = timeImportSourceSchema.safeParse(sourceParam)
    if (!source.success)
      throw new NotFoundException("Import from clockify, toggl or harvest")
    if (!req.isMultipart())
      throw new BadRequestException("Send the CSV as multipart/form-data")
    const file = await req.file({ limits: { fileSize: MAX_IMPORT_BYTES } })
    if (!file) throw new BadRequestException("No file uploaded")
    let buf: Buffer
    try {
      buf = await file.toBuffer()
    } catch {
      throw new BadRequestException({
        message: "Files must be 10 MB or smaller; export a shorter date range",
        code: "file_too_large",
      })
    }
    return this.clockify.import(
      {
        filename: file.filename || `${source.data}.csv`,
        text: buf.toString("utf8"),
      },
      {
        dryRun: (q as { dryRun?: string }).dryRun === "true",
        dateFormat: (q as { dateFormat: "auto" }).dateFormat ?? "auto",
        source: source.data,
      }
    )
  }
}
