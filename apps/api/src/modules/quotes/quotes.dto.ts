import {
  createQuoteSchema,
  listQuotesQuerySchema,
  quoteListSchema,
  quoteSchema,
  updateQuoteSchema,
} from "@workspace/contracts"
import { createZodDto } from "nestjs-zod"

export class QuoteDto extends createZodDto(quoteSchema) {}
export class QuoteListDto extends createZodDto(quoteListSchema) {}
export class CreateQuoteDto extends createZodDto(createQuoteSchema) {}
export class UpdateQuoteDto extends createZodDto(updateQuoteSchema) {}
export class ListQuotesQueryDto extends createZodDto(listQuotesQuerySchema) {}
