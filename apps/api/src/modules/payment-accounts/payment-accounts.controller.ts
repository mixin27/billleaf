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
  Put,
  Req,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  createPaymentAccountSchema,
  paymentAccountListSchema,
  paymentAccountSchema,
  reorderPaymentAccountsSchema,
  updatePaymentAccountSchema,
} from "@workspace/contracts"
import type { FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { readMultipart } from "../../common/http/multipart.js"
import { PaymentAccountsService } from "./payment-accounts.service.js"

class PaymentAccountDto extends createZodDto(paymentAccountSchema) {}
class PaymentAccountListDto extends createZodDto(paymentAccountListSchema) {}
class CreatePaymentAccountDto extends createZodDto(
  createPaymentAccountSchema
) {}
class UpdatePaymentAccountDto extends createZodDto(
  updatePaymentAccountSchema
) {}
class ReorderPaymentAccountsDto extends createZodDto(
  reorderPaymentAccountsSchema
) {}

const uuid = new ParseUUIDPipe()

/** Settings → Payment methods: how clients can pay this workspace. */
@ApiTags("payment-accounts")
@Controller({ path: "payment-accounts", version: "1" })
export class PaymentAccountsController {
  constructor(private readonly accounts: PaymentAccountsService) {}

  @Get()
  @RequirePermission("workspace.read")
  @ZodResponse({ status: 200, type: PaymentAccountListDto })
  async list() {
    return { items: await this.accounts.list() }
  }

  @Post()
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 201, type: PaymentAccountDto })
  create(@Body() body: CreatePaymentAccountDto) {
    return this.accounts.create(body as never)
  }

  @Put("order")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: PaymentAccountListDto })
  async reorder(@Body() body: ReorderPaymentAccountsDto) {
    return { items: await this.accounts.reorder(body.ids) }
  }

  @Patch(":id")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: PaymentAccountDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdatePaymentAccountDto) {
    return this.accounts.update(id, body as never)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("workspace.update")
  remove(@Param("id", uuid) id: string) {
    return this.accounts.remove(id)
  }

  /** multipart/form-data with a `file` field (PNG or JPEG, ≤ 1 MB). */
  @Put(":id/qr")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: PaymentAccountDto })
  async setQr(@Param("id", uuid) id: string, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req, {
      maxBytes: 1024 * 1024,
      requireFile: true,
    })
    return this.accounts.setQr(id, file!.filename, file!.body)
  }

  @Delete(":id/qr")
  @RequirePermission("workspace.update")
  @ZodResponse({ status: 200, type: PaymentAccountDto })
  removeQr(@Param("id", uuid) id: string) {
    return this.accounts.removeQr(id)
  }
}
