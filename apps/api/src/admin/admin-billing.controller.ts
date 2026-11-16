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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import {
  adminSubscriptionPaymentListSchema,
  adminSubscriptionPaymentQuerySchema,
  adminSubscriptionPaymentSchema,
  approveSubscriptionPaymentSchema,
  createPaymentAccountSchema,
  createPlatformPriceSchema,
  paymentAccountListSchema,
  paymentAccountSchema,
  platformPriceListSchema,
  platformPriceSchema,
  rejectSubscriptionPaymentSchema,
  reorderPaymentAccountsSchema,
  updatePaymentAccountSchema,
  updatePlatformPriceSchema,
} from "@workspace/contracts"
import type { FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { readMultipart } from "../common/http/multipart.js"
import { PlatformBillingService } from "../billing/manual/platform-billing.service.js"
import { SubscriptionPaymentsService } from "../billing/manual/subscription-payments.service.js"
import { PlatformAdminGuard } from "./platform-admin.guard.js"
import { SessionOnly } from "../common/decorators/require-permission.decorator.js"

class PlatformPriceDto extends createZodDto(platformPriceSchema) {}
class PlatformPriceListDto extends createZodDto(platformPriceListSchema) {}
class CreatePlatformPriceDto extends createZodDto(createPlatformPriceSchema) {}
class UpdatePlatformPriceDto extends createZodDto(updatePlatformPriceSchema) {}
class PlatformPaymentAccountDto extends createZodDto(paymentAccountSchema) {}
class PlatformPaymentAccountListDto extends createZodDto(
  paymentAccountListSchema
) {}
class CreatePlatformPaymentAccountDto extends createZodDto(
  createPaymentAccountSchema
) {}
class UpdatePlatformPaymentAccountDto extends createZodDto(
  updatePaymentAccountSchema
) {}
class ReorderPlatformPaymentAccountsDto extends createZodDto(
  reorderPaymentAccountsSchema
) {}
class AdminSubscriptionPaymentDto extends createZodDto(
  adminSubscriptionPaymentSchema
) {}
class AdminSubscriptionPaymentListDto extends createZodDto(
  adminSubscriptionPaymentListSchema
) {}
class AdminSubscriptionPaymentQueryDto extends createZodDto(
  adminSubscriptionPaymentQuerySchema
) {}
class ApproveSubscriptionPaymentDto extends createZodDto(
  approveSubscriptionPaymentSchema
) {}
class RejectSubscriptionPaymentDto extends createZodDto(
  rejectSubscriptionPaymentSchema
) {}

const uuid = new ParseUUIDPipe()

/** Manual SaaS billing for platform admins: prices, payment methods, approvals. */
@ApiTags("admin")
@SessionOnly()
@Controller({ path: "admin", version: "1" })
@UseGuards(PlatformAdminGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminBillingController {
  constructor(
    private readonly platform: PlatformBillingService,
    private readonly payments: SubscriptionPaymentsService
  ) {}

  // ── Prices ───────────────────────────────────────────────

  @Get("prices")
  @ZodResponse({ status: 200, type: PlatformPriceListDto })
  async prices() {
    return { items: await this.platform.prices() }
  }

  @Post("prices")
  @ZodResponse({ status: 201, type: PlatformPriceDto })
  createPrice(@Body() body: CreatePlatformPriceDto) {
    return this.platform.createPrice(body)
  }

  @Patch("prices/:id")
  @ZodResponse({ status: 200, type: PlatformPriceDto })
  updatePrice(
    @Param("id", uuid) id: string,
    @Body() body: UpdatePlatformPriceDto
  ) {
    return this.platform.updatePrice(id, body)
  }

  @Delete("prices/:id")
  @HttpCode(204)
  async removePrice(@Param("id", uuid) id: string) {
    await this.platform.removePrice(id)
  }

  // ── Billleaf's payment methods ───────────────────────────

  @Get("payment-accounts")
  @ZodResponse({ status: 200, type: PlatformPaymentAccountListDto })
  async accounts() {
    return { items: await this.platform.accounts() }
  }

  @Post("payment-accounts")
  @ZodResponse({ status: 201, type: PlatformPaymentAccountDto })
  createAccount(@Body() body: CreatePlatformPaymentAccountDto) {
    return this.platform.createAccount(body as never)
  }

  @Put("payment-accounts/order")
  @ZodResponse({ status: 200, type: PlatformPaymentAccountListDto })
  async reorderAccounts(@Body() body: ReorderPlatformPaymentAccountsDto) {
    return { items: await this.platform.reorderAccounts(body.ids) }
  }

  @Patch("payment-accounts/:id")
  @ZodResponse({ status: 200, type: PlatformPaymentAccountDto })
  updateAccount(
    @Param("id", uuid) id: string,
    @Body() body: UpdatePlatformPaymentAccountDto
  ) {
    return this.platform.updateAccount(id, body as never)
  }

  @Delete("payment-accounts/:id")
  @HttpCode(204)
  async removeAccount(@Param("id", uuid) id: string) {
    await this.platform.removeAccount(id)
  }

  /** multipart/form-data with a `file` field (PNG or JPEG, ≤ 1 MB). */
  @Put("payment-accounts/:id/qr")
  @ZodResponse({ status: 200, type: PlatformPaymentAccountDto })
  async setQr(@Param("id", uuid) id: string, @Req() req: FastifyRequest) {
    const { file } = await readMultipart(req, {
      maxBytes: 1024 * 1024,
      requireFile: true,
    })
    return this.platform.setQr(id, file!.body)
  }

  @Delete("payment-accounts/:id/qr")
  @ZodResponse({ status: 200, type: PlatformPaymentAccountDto })
  removeQr(@Param("id", uuid) id: string) {
    return this.platform.removeQr(id)
  }

  // ── Approvals ────────────────────────────────────────────

  @Get("subscription-payments")
  @ZodResponse({ status: 200, type: AdminSubscriptionPaymentListDto })
  subscriptionPayments(@Query() q: AdminSubscriptionPaymentQueryDto) {
    return this.payments.adminList(q as never)
  }

  @Post("subscription-payments/:id/approve")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminSubscriptionPaymentDto })
  approve(
    @Param("id", uuid) id: string,
    @Body() body: ApproveSubscriptionPaymentDto
  ) {
    return this.payments.approve(id, body)
  }

  @Post("subscription-payments/:id/reject")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: AdminSubscriptionPaymentDto })
  reject(
    @Param("id", uuid) id: string,
    @Body() body: RejectSubscriptionPaymentDto
  ) {
    return this.payments.reject(id, body.reason)
  }
}
