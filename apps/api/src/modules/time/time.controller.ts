import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  createTimeEntrySchema,
  invoiceFromTimeSchema,
  invoiceSchema,
  listTimeEntriesQuerySchema,
  projectTimeSummarySchema,
  startTimerSchema,
  timeEntryListSchema,
  timeEntrySchema,
  updateTimeEntrySchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"
import { z } from "zod"

import { RequireWorkspace } from "../../common/decorators/require-permission.decorator.js"
import { TimeService } from "./time.service.js"

class TimeEntryDto extends createZodDto(timeEntrySchema) {}
class RunningDto extends createZodDto(
  z.object({ entry: timeEntrySchema.nullable() })
) {}
class TimeEntryListDto extends createZodDto(timeEntryListSchema) {}
class ListQueryDto extends createZodDto(listTimeEntriesQuerySchema) {}
class StartDto extends createZodDto(startTimerSchema) {}
class CreateDto extends createZodDto(createTimeEntrySchema) {}
class UpdateDto extends createZodDto(updateTimeEntrySchema) {}
class SummaryDto extends createZodDto(projectTimeSummarySchema) {}
class InvoiceFromTimeDto extends createZodDto(invoiceFromTimeSchema) {}
class InvoiceDto extends createZodDto(invoiceSchema) {}

const uuid = new ParseUUIDPipe()

/** Fine-grained checks (own vs others' time) happen in TimeService. */
@ApiTags("time")
@Controller({ version: "1" })
@RequireWorkspace()
export class TimeController {
  constructor(private readonly time: TimeService) {}

  @Get("time-entries")
  @ZodResponse({ status: 200, type: TimeEntryListDto })
  list(@Query() q: ListQueryDto) {
    return this.time.list(q as never)
  }

  @Get("time-entries/running")
  @ZodResponse({ status: 200, type: RunningDto })
  async running() {
    return { entry: await this.time.running() }
  }

  @Post("time-entries/start")
  @ZodResponse({ status: 201, type: TimeEntryDto })
  start(@Body() body: StartDto) {
    return this.time.start(body as never)
  }

  @Post("time-entries/stop")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: TimeEntryDto })
  stop() {
    return this.time.stop()
  }

  @Post("time-entries")
  @ZodResponse({ status: 201, type: TimeEntryDto })
  create(@Body() body: CreateDto) {
    return this.time.create(body as never)
  }

  @Patch("time-entries/:id")
  @ZodResponse({ status: 200, type: TimeEntryDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateDto) {
    return this.time.update(id, body as never)
  }

  @Delete("time-entries/:id")
  @HttpCode(204)
  remove(@Param("id", uuid) id: string) {
    return this.time.remove(id)
  }

  @Get("projects/:id/time-summary")
  @ZodResponse({ status: 200, type: SummaryDto })
  summary(@Param("id", uuid) id: string) {
    return this.time.summary(id)
  }

  @Post("invoices/from-time")
  @ZodResponse({ status: 201, type: InvoiceDto })
  invoiceFromTime(@Body() body: InvoiceFromTimeDto) {
    return this.time.invoiceFromTime(body.projectId, body.entryIds)
  }
}
