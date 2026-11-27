import {
  BadRequestException,
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
  Req,
  Res,
} from "@nestjs/common"
import { ApiConsumes, ApiTags } from "@nestjs/swagger"
import {
  addCashbookMemberSchema,
  CASHBOOK_ATTACHMENT_MAX_BYTES,
  CASHBOOK_IMPORT_MAX_BYTES,
  cashbookEntryActivitySchema,
  cashbookEntryListSchema,
  cashbookEntrySchema,
  cashbookFilterSchema,
  cashbookImportQuerySchema,
  cashbookImportResultSchema,
  cashbookListSchema,
  cashbookMemberListSchema,
  cashbookOptionListSchema,
  cashbookOptionSchema,
  cashbookReportSchema,
  cashbookSchema,
  createCashbookEntrySchema,
  createCashbookSchema,
  deleteCashbookEntriesSchema,
  listCashbookEntriesQuerySchema,
  listCashbooksQuerySchema,
  saveCashbookOptionSchema,
  transferCashbookEntriesSchema,
  updateCashbookEntrySchema,
  updateCashbookMemberSchema,
  updateCashbookSchema,
} from "@workspace/contracts"
import type { FastifyReply, FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"
import { z } from "zod"

import {
  RequirePermission,
  RequireWorkspace,
} from "../../common/decorators/require-permission.decorator.js"
import { readMultipart } from "../../common/http/multipart.js"
import { CashbookEntriesService } from "./cashbook-entries.service.js"
import { CashbookImportService } from "./cashbook-import.service.js"
import { CashbookReportsService } from "./cashbook-reports.service.js"
import { CashbookService } from "./cashbook.service.js"

class CashbookDto extends createZodDto(cashbookSchema) {}
class CashbookListDto extends createZodDto(cashbookListSchema) {}
class ListCashbooksQueryDto extends createZodDto(listCashbooksQuerySchema) {}
class CreateCashbookDto extends createZodDto(createCashbookSchema) {}
class UpdateCashbookDto extends createZodDto(updateCashbookSchema) {}
class CashbookMemberListDto extends createZodDto(cashbookMemberListSchema) {}
class AddCashbookMemberDto extends createZodDto(addCashbookMemberSchema) {}
class UpdateCashbookMemberDto extends createZodDto(
  updateCashbookMemberSchema
) {}
class CashbookOptionDto extends createZodDto(cashbookOptionSchema) {}
class CashbookOptionListDto extends createZodDto(cashbookOptionListSchema) {}
class SaveCashbookOptionDto extends createZodDto(saveCashbookOptionSchema) {}
class UpdateCashbookOptionDto extends createZodDto(
  saveCashbookOptionSchema.partial()
) {}
class CashbookEntryDto extends createZodDto(cashbookEntrySchema) {}
class CashbookEntryListDto extends createZodDto(cashbookEntryListSchema) {}
class ListCashbookEntriesQueryDto extends createZodDto(
  listCashbookEntriesQuerySchema
) {}
class CreateCashbookEntryDto extends createZodDto(createCashbookEntrySchema) {}
class UpdateCashbookEntryDto extends createZodDto(updateCashbookEntrySchema) {}
class DeleteCashbookEntriesDto extends createZodDto(
  deleteCashbookEntriesSchema
) {}
class TransferCashbookEntriesDto extends createZodDto(
  transferCashbookEntriesSchema
) {}
class CountDto extends createZodDto(z.object({ count: z.number().int() })) {}
class DeletedDto extends createZodDto(
  z.object({ deleted: z.number().int() })
) {}
class CashbookEntryActivityDto extends createZodDto(
  cashbookEntryActivitySchema
) {}
class CashbookFilterDto extends createZodDto(cashbookFilterSchema) {}
class CashbookReportDto extends createZodDto(cashbookReportSchema) {}
class CashbookImportQueryDto extends createZodDto(cashbookImportQuerySchema) {}
class CashbookImportResultDto extends createZodDto(
  cashbookImportResultSchema
) {}

const uuid = new ParseUUIDPipe()
type OptionKind = "categories" | "modes"
const kindOf = (k: string): "category" | "mode" => {
  if (k === "categories") return "category"
  if (k === "modes") return "mode"
  throw new BadRequestException("Use categories or modes")
}

/**
 * Cashbooks (ADR-0019). Access is per book, checked in the services by
 * `CashbookAccess`; only creating a book needs a workspace permission.
 */
@ApiTags("cashbook")
@Controller({ path: "cashbooks", version: "1" })
@RequireWorkspace()
export class CashbookController {
  constructor(
    private readonly books: CashbookService,
    private readonly entries: CashbookEntriesService,
    private readonly reports: CashbookReportsService,
    private readonly importer: CashbookImportService
  ) {}

  // ── Books ──────────────────────────────────────────────────────────────

  @Get()
  @ZodResponse({ status: 200, type: CashbookListDto })
  async list(@Query() q: ListCashbooksQueryDto) {
    return {
      items: await this.books.list({ archived: Boolean(q.archived) }),
    }
  }

  @Post()
  @RequirePermission("cashbook.create")
  @ZodResponse({ status: 201, type: CashbookDto })
  create(@Body() body: CreateCashbookDto) {
    return this.books.create(body)
  }

  @Get(":bookId")
  @ZodResponse({ status: 200, type: CashbookDto })
  get(@Param("bookId", uuid) bookId: string) {
    return this.books.get(bookId)
  }

  @Patch(":bookId")
  @ZodResponse({ status: 200, type: CashbookDto })
  update(
    @Param("bookId", uuid) bookId: string,
    @Body() body: UpdateCashbookDto
  ) {
    return this.books.update(bookId, body)
  }

  @Delete(":bookId")
  @HttpCode(204)
  remove(@Param("bookId", uuid) bookId: string) {
    return this.books.remove(bookId)
  }

  // ── Members ────────────────────────────────────────────────────────────

  @Get(":bookId/members")
  @ZodResponse({ status: 200, type: CashbookMemberListDto })
  async members(@Param("bookId", uuid) bookId: string) {
    return { items: await this.books.members(bookId) }
  }

  @Post(":bookId/members")
  @ZodResponse({ status: 201, type: CashbookMemberListDto })
  async addMember(
    @Param("bookId", uuid) bookId: string,
    @Body() body: AddCashbookMemberDto
  ) {
    return { items: await this.books.addMember(bookId, body) }
  }

  @Patch(":bookId/members/:memberId")
  @ZodResponse({ status: 200, type: CashbookMemberListDto })
  async setMemberRole(
    @Param("bookId", uuid) bookId: string,
    @Param("memberId", uuid) memberId: string,
    @Body() body: UpdateCashbookMemberDto
  ) {
    return {
      items: await this.books.setMemberRole(bookId, memberId, body.role),
    }
  }

  /** Owners remove anyone; anyone can leave. */
  @Delete(":bookId/members/:memberId")
  @HttpCode(204)
  removeMember(
    @Param("bookId", uuid) bookId: string,
    @Param("memberId", uuid) memberId: string
  ) {
    return this.books.removeMember(bookId, memberId)
  }

  // ── Categories and payment modes ───────────────────────────────────────

  @Get(":bookId/:kind")
  @ZodResponse({ status: 200, type: CashbookOptionListDto })
  async options(
    @Param("bookId", uuid) bookId: string,
    @Param("kind") kind: OptionKind
  ) {
    return { items: await this.books.options(kindOf(kind), bookId) }
  }

  @Post(":bookId/:kind")
  @ZodResponse({ status: 201, type: CashbookOptionDto })
  createOption(
    @Param("bookId", uuid) bookId: string,
    @Param("kind") kind: OptionKind,
    @Body() body: SaveCashbookOptionDto
  ) {
    return this.books.createOption(kindOf(kind), bookId, body)
  }

  @Patch(":bookId/:kind/:id")
  @ZodResponse({ status: 200, type: CashbookOptionDto })
  updateOption(
    @Param("bookId", uuid) bookId: string,
    @Param("kind") kind: OptionKind,
    @Param("id", uuid) id: string,
    @Body() body: UpdateCashbookOptionDto
  ) {
    return this.books.updateOption(kindOf(kind), bookId, id, body)
  }

  @Delete(":bookId/:kind/:id")
  @HttpCode(204)
  removeOption(
    @Param("bookId", uuid) bookId: string,
    @Param("kind") kind: OptionKind,
    @Param("id", uuid) id: string
  ) {
    return this.books.removeOption(kindOf(kind), bookId, id)
  }

  // ── Entries ────────────────────────────────────────────────────────────

  @Get(":bookId/entries")
  @ZodResponse({ status: 200, type: CashbookEntryListDto })
  listEntries(
    @Param("bookId", uuid) bookId: string,
    @Query() q: ListCashbookEntriesQueryDto
  ) {
    return this.entries.list(bookId, q as never)
  }

  @Post(":bookId/entries")
  @ZodResponse({ status: 201, type: CashbookEntryDto })
  createEntry(
    @Param("bookId", uuid) bookId: string,
    @Body() body: CreateCashbookEntryDto
  ) {
    return this.entries.create(bookId, body)
  }

  /** Delete several entries at once. */
  @Post(":bookId/entries/delete")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: DeletedDto })
  deleteEntries(
    @Param("bookId", uuid) bookId: string,
    @Body() body: DeleteCashbookEntriesDto
  ) {
    return this.entries.remove(bookId, body.entryIds)
  }

  /**
   * Import the CashBook app's CSV export (multipart `file`, up to 5 MB).
   * `?dryRun=true` previews without writing. Rows already imported are
   * skipped. Admin in the book.
   */
  @Post(":bookId/import")
  @HttpCode(200)
  @ApiConsumes("multipart/form-data")
  @ZodResponse({ status: 200, type: CashbookImportResultDto })
  async importCsv(
    @Param("bookId", uuid) bookId: string,
    @Query() q: CashbookImportQueryDto,
    @Req() req: FastifyRequest
  ) {
    const { file } = await readMultipart(req, {
      maxBytes: CASHBOOK_IMPORT_MAX_BYTES,
    })
    if (!file)
      throw new BadRequestException({
        message: "Choose the CSV file exported from CashBook",
        code: "file_required",
      })
    return this.importer.import(
      bookId,
      { filename: file.filename, text: file.body.toString("utf8") },
      { dryRun: (q as { dryRun?: string }).dryRun === "true" }
    )
  }

  /** Move or copy entries to another book (admin in both). */
  @Post(":bookId/entries/transfer")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: CountDto })
  transfer(
    @Param("bookId", uuid) bookId: string,
    @Body() body: TransferCashbookEntriesDto
  ) {
    return this.entries.transfer(bookId, body)
  }

  @Get(":bookId/entries/:id")
  @ZodResponse({ status: 200, type: CashbookEntryDto })
  getEntry(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string
  ) {
    return this.entries.get(bookId, id)
  }

  @Patch(":bookId/entries/:id")
  @ZodResponse({ status: 200, type: CashbookEntryDto })
  updateEntry(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string,
    @Body() body: UpdateCashbookEntryDto
  ) {
    return this.entries.update(bookId, id, body)
  }

  @Delete(":bookId/entries/:id")
  @HttpCode(204)
  async deleteEntry(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string
  ) {
    await this.entries.remove(bookId, [id])
  }

  @Get(":bookId/entries/:id/activity")
  @ZodResponse({ status: 200, type: CashbookEntryActivityDto })
  activity(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string
  ) {
    return this.entries.activity(bookId, id)
  }

  @Post(":bookId/entries/:id/attachments")
  @ApiConsumes("multipart/form-data")
  @ZodResponse({ status: 201, type: CashbookEntryDto })
  async addAttachment(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string,
    @Req() req: FastifyRequest
  ) {
    const { file } = await readMultipart(req, {
      maxBytes: CASHBOOK_ATTACHMENT_MAX_BYTES,
    })
    if (!file)
      throw new BadRequestException({
        message: "Attach a photo or PDF",
        code: "file_required",
      })
    return this.entries.addAttachment(bookId, id, file)
  }

  @Delete(":bookId/entries/:id/attachments/:fileId")
  @ZodResponse({ status: 200, type: CashbookEntryDto })
  removeAttachment(
    @Param("bookId", uuid) bookId: string,
    @Param("id", uuid) id: string,
    @Param("fileId", uuid) fileId: string
  ) {
    return this.entries.removeAttachment(bookId, id, fileId)
  }

  // ── Reports ────────────────────────────────────────────────────────────

  @Get(":bookId/report")
  @ZodResponse({ status: 200, type: CashbookReportDto })
  report(@Param("bookId", uuid) bookId: string, @Query() q: CashbookFilterDto) {
    return this.reports.report(bookId, q)
  }

  /** Every matching entry, oldest first, with the running balance. */
  @Get(":bookId/export.csv")
  @Header("cache-control", "private, no-store")
  async csv(
    @Param("bookId", uuid) bookId: string,
    @Query() q: CashbookFilterDto,
    @Res() reply: FastifyReply
  ) {
    const { filename, content } = await this.reports.csv(bookId, q)
    void reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(content)
  }

  @Get(":bookId/statement.pdf")
  @Header("cache-control", "private, no-store")
  async pdf(
    @Param("bookId", uuid) bookId: string,
    @Query() q: CashbookFilterDto,
    @Res() reply: FastifyReply
  ) {
    const { filename, content } = await this.reports.pdf(bookId, q)
    void reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `inline; filename="${filename}"`)
      .send(content)
  }
}
