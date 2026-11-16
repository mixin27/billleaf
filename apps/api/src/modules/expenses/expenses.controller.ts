import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common"
import { ApiConsumes, ApiTags } from "@nestjs/swagger"
import {
  createExpenseSchema,
  EXPENSE_RECEIPT_MAX_BYTES,
  expenseCategoryListSchema,
  expenseCategorySchema,
  expenseListSchema,
  expenseSchema,
  invoiceFromExpensesSchema,
  invoiceSchema,
  listExpensesQuerySchema,
  profitLossQuerySchema,
  profitLossSchema,
  saveExpenseCategorySchema,
  updateExpenseSchema,
} from "@workspace/contracts"
import type { FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { readMultipart } from "../../common/http/multipart.js"
import { ExpensesService } from "./expenses.service.js"
import { ProfitLossService } from "./profit-loss.service.js"

class ExpenseDto extends createZodDto(expenseSchema) {}
class ExpenseListDto extends createZodDto(expenseListSchema) {}
class ListExpensesQueryDto extends createZodDto(listExpensesQuerySchema) {}
class CreateExpenseDto extends createZodDto(createExpenseSchema) {}
class UpdateExpenseDto extends createZodDto(updateExpenseSchema) {}
class ExpenseCategoryDto extends createZodDto(expenseCategorySchema) {}
class ExpenseCategoryListDto extends createZodDto(expenseCategoryListSchema) {}
class SaveExpenseCategoryDto extends createZodDto(saveExpenseCategorySchema) {}
class UpdateExpenseCategoryDto extends createZodDto(
  saveExpenseCategorySchema.partial()
) {}
class InvoiceFromExpensesDto extends createZodDto(invoiceFromExpensesSchema) {}
class ExpenseInvoiceDto extends createZodDto(invoiceSchema) {}
class ProfitLossQueryDto extends createZodDto(profitLossQuerySchema) {}
class ProfitLossDto extends createZodDto(profitLossSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("expenses")
@Controller({ version: "1" })
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly reports: ProfitLossService
  ) {}

  @Get("expense-categories")
  @RequirePermission("expense.read")
  @ZodResponse({ status: 200, type: ExpenseCategoryListDto })
  async categories() {
    return { items: await this.expenses.categories() }
  }

  @Post("expense-categories")
  @RequirePermission("expense.update")
  @ZodResponse({ status: 201, type: ExpenseCategoryDto })
  createCategory(@Body() body: SaveExpenseCategoryDto) {
    return this.expenses.createCategory(body)
  }

  @Patch("expense-categories/:id")
  @RequirePermission("expense.update")
  @ZodResponse({ status: 200, type: ExpenseCategoryDto })
  updateCategory(
    @Param("id", uuid) id: string,
    @Body() body: UpdateExpenseCategoryDto
  ) {
    return this.expenses.updateCategory(id, body)
  }

  @Get("expenses")
  @RequirePermission("expense.read")
  @ZodResponse({ status: 200, type: ExpenseListDto })
  list(@Query() q: ListExpensesQueryDto) {
    return this.expenses.list(q as never)
  }

  @Get("expenses/:id")
  @RequirePermission("expense.read")
  @ZodResponse({ status: 200, type: ExpenseDto })
  get(@Param("id", uuid) id: string) {
    return this.expenses.get(id)
  }

  @Post("expenses")
  @RequirePermission("expense.create")
  @ZodResponse({ status: 201, type: ExpenseDto })
  create(@Body() body: CreateExpenseDto) {
    return this.expenses.create(body)
  }

  @Patch("expenses/:id")
  @RequirePermission("expense.update")
  @ZodResponse({ status: 200, type: ExpenseDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateExpenseDto) {
    return this.expenses.update(id, body)
  }

  @Delete("expenses/:id")
  @HttpCode(204)
  @RequirePermission("expense.delete")
  remove(@Param("id", uuid) id: string) {
    return this.expenses.remove(id)
  }

  /** multipart/form-data `file`: PNG/JPEG photo or PDF, ≤ 5 MB. */
  @Put("expenses/:id/receipt")
  @RequirePermission("expense.update")
  @ApiConsumes("multipart/form-data")
  @ZodResponse({ status: 200, type: ExpenseDto })
  async setReceipt(@Param("id", uuid) id: string, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req, {
      maxBytes: EXPENSE_RECEIPT_MAX_BYTES,
    })
    if (!file)
      throw new BadRequestException({
        message: "Attach a photo or PDF of the receipt",
        code: "file_required",
      })
    return this.expenses.setReceipt(id, file)
  }

  @Delete("expenses/:id/receipt")
  @RequirePermission("expense.update")
  @ZodResponse({ status: 200, type: ExpenseDto })
  removeReceipt(@Param("id", uuid) id: string) {
    return this.expenses.removeReceipt(id)
  }

  /** Billable, unbilled expenses of a client → a draft invoice. */
  @Post("invoices/from-expenses")
  @RequirePermission("invoice.create", "expense.read")
  @ZodResponse({ status: 201, type: ExpenseInvoiceDto })
  invoiceFromExpenses(@Body() body: InvoiceFromExpensesDto) {
    return this.expenses.invoiceFromExpenses(body.clientId, body.expenseIds)
  }

  /** Income vs expenses per month, expenses by category, tax summary. */
  @Get("reports/profit-loss")
  @RequirePermission("payment.read", "expense.read")
  @ZodResponse({ status: 200, type: ProfitLossDto })
  profitLoss(@Query() q: ProfitLossQueryDto) {
    return this.reports.report(q.from, q.to)
  }
}
