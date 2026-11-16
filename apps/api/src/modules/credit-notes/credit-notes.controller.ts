import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  createCreditNoteSchema,
  creditNoteListSchema,
  creditNoteSchema,
  listCreditNotesQuerySchema,
  sendCreditNoteSchema,
  voidCreditNoteSchema,
} from "@workspace/contracts"
import type { FastifyReply } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { CreditNotesService } from "./credit-notes.service.js"

class CreditNoteDto extends createZodDto(creditNoteSchema) {}
class CreditNoteListDto extends createZodDto(creditNoteListSchema) {}
class ListCreditNotesQueryDto extends createZodDto(
  listCreditNotesQuerySchema
) {}
class CreateCreditNoteDto extends createZodDto(createCreditNoteSchema) {}
class VoidCreditNoteDto extends createZodDto(voidCreditNoteSchema) {}
class SendCreditNoteDto extends createZodDto(sendCreditNoteSchema) {}

const uuid = new ParseUUIDPipe()

/**
 * Credit notes correct issued invoices. Issuing or voiding one needs
 * `invoice.void` (it changes what an issued invoice is worth).
 */
@ApiTags("invoices")
@Controller({ version: "1" })
export class CreditNotesController {
  constructor(private readonly notes: CreditNotesService) {}

  @Get("credit-notes")
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: CreditNoteListDto })
  list(@Query() q: ListCreditNotesQueryDto) {
    return this.notes.list(q as never)
  }

  @Get("credit-notes/:id")
  @RequirePermission("invoice.read")
  @ZodResponse({ status: 200, type: CreditNoteDto })
  get(@Param("id", uuid) id: string) {
    return this.notes.get(id)
  }

  @Get("credit-notes/:id/pdf")
  @RequirePermission("invoice.read")
  @Header("cache-control", "private, no-store")
  async pdf(@Param("id", uuid) id: string, @Res() reply: FastifyReply) {
    const { filename, content } = await this.notes.pdf(id)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }

  /** Issue a credit note for the whole invoice (`full`) or given lines. */
  @Post("invoices/:id/credit-notes")
  @RequirePermission("invoice.void")
  @ZodResponse({ status: 201, type: CreditNoteDto })
  create(@Param("id", uuid) id: string, @Body() body: CreateCreditNoteDto) {
    return this.notes.create(id, body as never)
  }

  @Post("credit-notes/:id/void")
  @RequirePermission("invoice.void")
  @ZodResponse({ status: 201, type: CreditNoteDto })
  void(@Param("id", uuid) id: string, @Body() body: VoidCreditNoteDto) {
    return this.notes.void(id, body.reason)
  }

  @Post("credit-notes/:id/send")
  @RequirePermission("invoice.send")
  @ZodResponse({ status: 201, type: CreditNoteDto })
  send(@Param("id", uuid) id: string, @Body() body: SendCreditNoteDto) {
    return this.notes.send(id, body)
  }
}
