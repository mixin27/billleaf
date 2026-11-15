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
import { ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import {
  CreateQuoteDto,
  ListQuotesQueryDto,
  QuoteDto,
  QuoteListDto,
  UpdateQuoteDto,
} from "./quotes.dto.js"
import { QuotesService } from "./quotes.service.js"

const uuid = new ParseUUIDPipe()

@ApiTags("quotes")
@Controller({ path: "quotes", version: "1" })
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequirePermission("quote.read")
  @ZodResponse({ status: 200, type: QuoteListDto })
  list(@Query() query: ListQuotesQueryDto) {
    return this.quotes.list(query as never)
  }

  @Get(":id")
  @RequirePermission("quote.read")
  @ZodResponse({ status: 200, type: QuoteDto })
  get(@Param("id", uuid) id: string) {
    return this.quotes.get(id)
  }

  @Post()
  @RequirePermission("quote.create")
  @ZodResponse({ status: 201, type: QuoteDto })
  create(@Body() body: CreateQuoteDto) {
    return this.quotes.create(body as never)
  }

  @Patch(":id")
  @RequirePermission("quote.update")
  @ZodResponse({ status: 200, type: QuoteDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateQuoteDto) {
    return this.quotes.update(id, body as never)
  }

  @Post(":id/send")
  @HttpCode(200)
  @RequirePermission("quote.send")
  @ZodResponse({ status: 200, type: QuoteDto })
  send(@Param("id", uuid) id: string) {
    return this.quotes.send(id)
  }

  @Post(":id/accept")
  @HttpCode(200)
  @RequirePermission("quote.update")
  @ZodResponse({ status: 200, type: QuoteDto })
  accept(@Param("id", uuid) id: string) {
    return this.quotes.respond(id, "accepted")
  }

  @Post(":id/decline")
  @HttpCode(200)
  @RequirePermission("quote.update")
  @ZodResponse({ status: 200, type: QuoteDto })
  decline(@Param("id", uuid) id: string) {
    return this.quotes.respond(id, "declined")
  }

  @Post(":id/duplicate")
  @RequirePermission("quote.create")
  @ZodResponse({ status: 201, type: QuoteDto })
  duplicate(@Param("id", uuid) id: string) {
    return this.quotes.duplicate(id)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("quote.delete")
  remove(@Param("id", uuid) id: string) {
    return this.quotes.remove(id)
  }
}
