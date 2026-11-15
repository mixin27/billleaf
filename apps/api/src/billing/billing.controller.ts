import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common"
import { ApiExcludeEndpoint, ApiTags } from "@nestjs/swagger"
import { AllowAnonymous } from "@thallesp/nestjs-better-auth"
import {
  billingOverviewSchema,
  billingRedirectSchema,
  checkoutInputSchema,
  testCheckoutCompleteSchema,
  testPortalActionSchema,
  testSessionSchema,
} from "@workspace/contracts"
import type { FastifyRequest } from "fastify"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../common/decorators/require-permission.decorator.js"
import { BillingService } from "./billing.service.js"

class BillingOverviewDto extends createZodDto(billingOverviewSchema) {}
class BillingRedirectDto extends createZodDto(billingRedirectSchema) {}
class CheckoutDto extends createZodDto(checkoutInputSchema) {}
class TestCheckoutDto extends createZodDto(testCheckoutCompleteSchema) {}
class TestPortalDto extends createZodDto(testPortalActionSchema) {}
class TestSessionDto extends createZodDto(testSessionSchema) {}

@ApiTags("billing")
@Controller({ path: "billing", version: "1" })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermission("billing.read")
  @ZodResponse({ status: 200, type: BillingOverviewDto })
  overview() {
    return this.billing.overview()
  }

  /** Hosted checkout URL for a new subscription. */
  @Post("checkout")
  @HttpCode(200)
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: BillingRedirectDto })
  checkout(@Body() body: CheckoutDto) {
    return this.billing.checkout(body)
  }

  @Post("change-plan")
  @HttpCode(200)
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: BillingOverviewDto })
  changePlan(@Body() body: CheckoutDto) {
    return this.billing.changePlan(body)
  }

  /** Provider portal (payment method, invoices, cancel). */
  @Post("portal")
  @HttpCode(200)
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: BillingRedirectDto })
  portal() {
    return this.billing.portal()
  }

  /** Provider webhooks: signature-verified, no session. */
  @Post("webhooks/:provider")
  @HttpCode(200)
  @AllowAnonymous()
  @ApiExcludeEndpoint()
  webhook(
    @Param("provider") provider: string,
    @Req() req: FastifyRequest & { rawBody?: Buffer }
  ) {
    return this.billing.handleWebhook(provider, req.rawBody, req.headers)
  }

  // Test provider pages (local development and CI only).

  @Get("test/session")
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: TestSessionDto })
  testSession(@Query("session") session: string) {
    return this.billing.testSession(session ?? "")
  }

  @Post("test/checkout")
  @HttpCode(200)
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: BillingOverviewDto })
  testCheckout(@Body() body: TestCheckoutDto) {
    return this.billing.completeTestCheckout(body.session)
  }

  @Post("test/portal")
  @HttpCode(200)
  @RequirePermission("billing.manage")
  @ZodResponse({ status: 200, type: BillingOverviewDto })
  testPortal(@Body() body: TestPortalDto) {
    return this.billing.testPortalAction(body.session, body.action)
  }
}
