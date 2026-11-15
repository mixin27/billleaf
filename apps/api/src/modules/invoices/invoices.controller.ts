import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  createInvoiceSchema,
  invoiceListSchema,
  invoiceSchema,
  listInvoicesQuerySchema,
  sendDocumentSchema,
  updateInvoiceSchema,
  voidInvoiceSchema,
} from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { InvoicesService } from "./invoices.service.js"

class InvoiceDto extends createZodDto(invoiceSchema) {}
class InvoiceListDto extends createZodDto(invoiceListSchema) {}
class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
class UpdateInvoiceDto extends createZodDto(updateInvoiceSchema) {}
class ListInvoicesQueryDto extends createZodDto(listInvoicesQuerySchema) {}
class VoidInvoiceDto extends createZodDto(voidInvoiceSchema) {}
class SendDocumentDto extends createZodDto(sendDocumentSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("invoices")
@Controller({ path: "invoices", version: "1" })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: InvoiceListDto })
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoices.list(query as never)
  }

  @Get(":id")
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: InvoiceDto })
  get(@Param("id", uuid) id: string) {
    return this.invoices.get(id)
  }

  @Get(":id/pdf")
  @RequirePermission("invoice.read")
  @Header("cache-control", "private, no-store")
  async pdf(@Param("id", uuid) id: string, @Res() reply: FastifyReply) {
    const { filename, content } = await this.invoices.pdf(id)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }

  @Post()
  @RequirePermission("invoice.create")
  @ZodResponse({ status: 201, type: InvoiceDto })
  create(@Body() body: CreateInvoiceDto) {
    return this.invoices.create(body as never)
  }

  @Post("from-quote/:quoteId")
  @RequirePermission("invoice.create")
  @ZodResponse({ status: 201, type: InvoiceDto })
  fromQuote(@Param("quoteId", uuid) quoteId: string) {
    return this.invoices.createFromQuote(quoteId)
  }

  @Patch(":id")
  @RequirePermission("invoice.update")
  @ZodResponse({ status: 200, type: InvoiceDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateInvoiceDto) {
    return this.invoices.update(id, body as never)
  }

  @Post(":id/issue")
  @HttpCode(200)
  @RequirePermission("invoice.send")
  @ZodResponse({ status: 200, type: InvoiceDto })
  issue(@Param("id", uuid) id: string) {
    return this.invoices.issue(id)
  }

  @Post(":id/send")
  @HttpCode(200)
  @RequirePermission("invoice.send")
  @ZodResponse({ status: 200, type: InvoiceDto })
  send(@Param("id", uuid) id: string, @Body() body: SendDocumentDto) {
    return this.invoices.send(id, body as never)
  }

  @Post(":id/void")
  @HttpCode(200)
  @RequirePermission("invoice.void")
  @ZodResponse({ status: 200, type: InvoiceDto })
  void(@Param("id", uuid) id: string, @Body() body: VoidInvoiceDto) {
    return this.invoices.void(id, body.reason)
  }

  @Post(":id/duplicate")
  @RequirePermission("invoice.create")
  @ZodResponse({ status: 201, type: InvoiceDto })
  duplicate(@Param("id", uuid) id: string) {
    return this.invoices.duplicate(id)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("invoice.update")
  remove(@Param("id", uuid) id: string) {
    return this.invoices.remove(id)
  }
}
