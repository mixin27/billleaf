import { BadRequestException, Controller, Get, Post, Req } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Throttle } from "@nestjs/throttler"
import {
  manualBillingOptionsSchema,
  submitSubscriptionPaymentSchema,
  subscriptionPaymentListSchema,
  subscriptionPaymentSchema,
} from "@workspace/contracts"
import type { FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { readMultipart } from "../../common/http/multipart.js"
import { SubscriptionPaymentsService } from "./subscription-payments.service.js"

class ManualBillingOptionsDto extends createZodDto(
  manualBillingOptionsSchema
) {}
class SubscriptionPaymentDto extends createZodDto(subscriptionPaymentSchema) {}
class SubscriptionPaymentListDto extends createZodDto(
  subscriptionPaymentListSchema
) {}

/** Manual billing for the active workspace: pay, upload proof, history. */
@ApiTags("billing")
@Controller({ path: "billing/manual", version: "1" })
export class ManualBillingController {
  constructor(private readonly payments: SubscriptionPaymentsService) {}

  /** Prices, Billleaf's payment methods and any request waiting for review. */
  @Get("options")
  @RequirePermission("billing.read")
  @ZodResponse({ status: 200, type: ManualBillingOptionsDto })
  options() {
    return this.payments.options()
  }

  @Get("payments")
  @RequirePermission("billing.read")
  @ZodResponse({ status: 200, type: SubscriptionPaymentListDto })
  async history() {
    return { items: await this.payments.history() }
  }

  /**
   * multipart/form-data: the proof image (`file`, PNG/JPEG ≤ 2 MB) plus
   * planKey, interval, currency, periods, paidOn, platformPaymentAccountId,
   * reference, note.
   */
  @Post("payments")
  @RequirePermission("billing.manage")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ZodResponse({ status: 201, type: SubscriptionPaymentDto })
  async submit(@Req() req: FastifyRequest) {
    const { file, fields } = await readMultipart(req, {
      maxBytes: 2 * 1024 * 1024,
      requireFile: true,
    })
    const parsed = submitSubscriptionPaymentSchema.safeParse(fields)
    if (!parsed.success)
      throw new BadRequestException({
        message: parsed.error.issues[0]?.message ?? "Check the payment details",
        code: "invalid_subscription_payment",
      })
    return this.payments.submit(parsed.data, file!, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    })
  }
}
