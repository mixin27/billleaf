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
  createRecurringInvoiceSchema,
  listRecurringQuerySchema,
  recurringInvoiceSchema,
  recurringListSchema,
  recurringRunResultSchema,
  updateRecurringInvoiceSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"
import { z } from "zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { RecurringService } from "./recurring.service.js"

class RecurringDto extends createZodDto(recurringInvoiceSchema) {}
class RecurringListDto extends createZodDto(recurringListSchema) {}
class ListRecurringQueryDto extends createZodDto(listRecurringQuerySchema) {}
class CreateRecurringDto extends createZodDto(createRecurringInvoiceSchema) {}
class UpdateRecurringDto extends createZodDto(updateRecurringInvoiceSchema) {}
class RunResultDto extends createZodDto(recurringRunResultSchema) {}
class HistoryDto extends createZodDto(
  z.array(
    z.object({
      id: z.string(),
      number: z.string().nullable(),
      status: z.string(),
      period: z.string().nullable(),
      total: z.number().int(),
      amountPaid: z.number().int(),
      currency: z.string(),
      dueDate: z.string().nullable(),
    })
  )
) {}

const uuid = new ParseUUIDPipe()

@ApiTags("recurring-invoices")
@Controller({ path: "recurring-invoices", version: "1" })
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: RecurringListDto })
  list(@Query() query: ListRecurringQueryDto) {
    return this.recurring.list(query as never)
  }

  @Get(":id")
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: RecurringDto })
  get(@Param("id", uuid) id: string) {
    return this.recurring.get(id)
  }

  @Get(":id/invoices")
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: HistoryDto })
  history(@Param("id", uuid) id: string) {
    return this.recurring.history(id)
  }

  @Post()
  @RequirePermission("invoice.create")
  @ZodResponse({ status: 201, type: RecurringDto })
  create(@Body() body: CreateRecurringDto) {
    return this.recurring.create(body as never)
  }

  @Patch(":id")
  @RequirePermission("invoice.create")
  @ZodResponse({ status: 200, type: RecurringDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateRecurringDto) {
    return this.recurring.update(id, body as never)
  }

  /** Generate the next period now (issues + emails too when mode = send). */
  @Post(":id/run")
  @HttpCode(200)
  @RequirePermission("invoice.create", "invoice.send")
  @ZodResponse({ status: 200, type: RunResultDto })
  run(@Param("id", uuid) id: string) {
    return this.recurring.runNow(id)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("invoice.create")
  remove(@Param("id", uuid) id: string) {
    return this.recurring.remove(id)
  }
}
