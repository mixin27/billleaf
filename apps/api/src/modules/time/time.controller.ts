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
  bulkDeleteTimeEntriesSchema,
  bulkResultSchema,
  bulkUpdateTimeEntriesSchema,
  createTagSchema,
  createTimeEntrySchema,
  invoiceFromTimeSchema,
  invoiceSchema,
  listTimeEntriesQuerySchema,
  projectBudgetSchema,
  projectTimeSummarySchema,
  startTimerSchema,
  tagListSchema,
  tagSchema,
  timeEntryListSchema,
  timeEntrySchema,
  timeSuggestionListSchema,
  timeSuggestionsQuerySchema,
  updateRunningSchema,
  updateTagSchema,
  updateTimeEntrySchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"
import { z } from "zod"

import {
  RequirePermission,
  RequireWorkspace,
} from "../../common/decorators/require-permission.decorator.js"
import { BudgetsService } from "./budgets.service.js"
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
class ProjectBudgetListDto extends createZodDto(z.array(projectBudgetSchema)) {}
class InvoiceFromTimeDto extends createZodDto(invoiceFromTimeSchema) {}
class InvoiceDto extends createZodDto(invoiceSchema) {}
class UpdateRunningDto extends createZodDto(updateRunningSchema) {}
class BulkUpdateDto extends createZodDto(bulkUpdateTimeEntriesSchema) {}
class BulkDeleteDto extends createZodDto(bulkDeleteTimeEntriesSchema) {}
class BulkResultDto extends createZodDto(bulkResultSchema) {}
class SuggestionsQueryDto extends createZodDto(timeSuggestionsQuerySchema) {}
class SuggestionListDto extends createZodDto(timeSuggestionListSchema) {}
class TagDto extends createZodDto(tagSchema) {}
class TagListDto extends createZodDto(tagListSchema) {}
class CreateTagDto extends createZodDto(createTagSchema) {}
class UpdateTagDto extends createZodDto(updateTagSchema) {}

const uuid = new ParseUUIDPipe()

/** Fine-grained checks (own vs others' time) happen in TimeService. */
@ApiTags("time")
@Controller({ version: "1" })
@RequireWorkspace()
export class TimeController {
  constructor(
    private readonly time: TimeService,
    private readonly budgetsService: BudgetsService
  ) {}

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

  @Patch("time-entries/running")
  @ZodResponse({ status: 200, type: TimeEntryDto })
  updateRunning(@Body() body: UpdateRunningDto) {
    return this.time.updateRunning(body as never)
  }

  @Get("time-entries/suggestions")
  @ZodResponse({ status: 200, type: SuggestionListDto })
  async suggestions(@Query() q: SuggestionsQueryDto) {
    return { items: await this.time.suggestions(q.q) }
  }

  @Patch("time-entries/bulk")
  @ZodResponse({ status: 200, type: BulkResultDto })
  bulkUpdate(@Body() body: BulkUpdateDto) {
    return this.time.bulkUpdate(body as never)
  }

  @Post("time-entries/bulk-delete")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: BulkResultDto })
  bulkDelete(@Body() body: BulkDeleteDto) {
    return this.time.bulkDelete(body.ids)
  }

  @Post("time-entries/:id/continue")
  @ZodResponse({ status: 201, type: TimeEntryDto })
  continue(@Param("id", uuid) id: string) {
    return this.time.continue(id)
  }

  @Post("time-entries/:id/duplicate")
  @ZodResponse({ status: 201, type: TimeEntryDto })
  duplicate(@Param("id", uuid) id: string) {
    return this.time.duplicate(id)
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

  @Get("tags")
  @ZodResponse({ status: 200, type: TagListDto })
  async tags() {
    return { items: await this.time.listTags() }
  }

  @Post("tags")
  @ZodResponse({ status: 201, type: TagDto })
  createTag(@Body() body: CreateTagDto) {
    return this.time.createTag(body as never)
  }

  @Patch("tags/:id")
  @ZodResponse({ status: 200, type: TagDto })
  updateTag(@Param("id", uuid) id: string, @Body() body: UpdateTagDto) {
    return this.time.updateTag(id, body as never)
  }

  @Delete("tags/:id")
  @HttpCode(204)
  deleteTag(@Param("id", uuid) id: string) {
    return this.time.deleteTag(id)
  }

  @Get("projects/:id/time-summary")
  @ZodResponse({ status: 200, type: SummaryDto })
  summary(@Param("id", uuid) id: string) {
    return this.time.summary(id)
  }

  /** Active projects with an estimate, the most used first. */
  @Get("project-budgets")
  @RequirePermission("project.read")
  @ZodResponse({ status: 200, type: ProjectBudgetListDto })
  budgets() {
    return this.budgetsService.list()
  }

  @Post("invoices/from-time")
  @ZodResponse({ status: 201, type: InvoiceDto })
  invoiceFromTime(@Body() body: InvoiceFromTimeDto) {
    return this.time.invoiceFromTime(body.projectId, body.entryIds)
  }
}
