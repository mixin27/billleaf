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
import {
  createWebhookEndpointSchema,
  listWebhookDeliveriesQuerySchema,
  updateWebhookEndpointSchema,
  webhookDeliveryListSchema,
  webhookDeliverySchema,
  webhookEndpointListSchema,
  webhookEndpointSchema,
  webhookSecretSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { WebhooksService } from "./webhooks.service.js"

class WebhookEndpointDto extends createZodDto(webhookEndpointSchema) {}
class WebhookEndpointListDto extends createZodDto(webhookEndpointListSchema) {}
class WebhookSecretDto extends createZodDto(webhookSecretSchema) {}
class CreateWebhookEndpointDto extends createZodDto(
  createWebhookEndpointSchema
) {}
class UpdateWebhookEndpointDto extends createZodDto(
  updateWebhookEndpointSchema
) {}
class WebhookDeliveryDto extends createZodDto(webhookDeliverySchema) {}
class WebhookDeliveryListDto extends createZodDto(webhookDeliveryListSchema) {}
class ListWebhookDeliveriesQueryDto extends createZodDto(
  listWebhookDeliveriesQuerySchema
) {}

const uuid = new ParseUUIDPipe()

/** Settings → Webhooks (Pro/Team). */
@ApiTags("webhooks")
@Controller({ version: "1" })
@RequirePermission("webhook.manage")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get("webhooks")
  @ZodResponse({ status: 200, type: WebhookEndpointListDto })
  list() {
    return this.webhooks.list()
  }

  /** The response carries the signing secret; it's shown only now. */
  @Post("webhooks")
  @ZodResponse({ status: 201, type: WebhookSecretDto })
  create(@Body() body: CreateWebhookEndpointDto) {
    return this.webhooks.create(body)
  }

  @Patch("webhooks/:id")
  @ZodResponse({ status: 200, type: WebhookEndpointDto })
  update(
    @Param("id", uuid) id: string,
    @Body() body: UpdateWebhookEndpointDto
  ) {
    return this.webhooks.update(id, body)
  }

  @Delete("webhooks/:id")
  @HttpCode(204)
  remove(@Param("id", uuid) id: string) {
    return this.webhooks.remove(id)
  }

  @Post("webhooks/:id/rotate-secret")
  @ZodResponse({ status: 201, type: WebhookSecretDto })
  rotate(@Param("id", uuid) id: string) {
    return this.webhooks.rotateSecret(id)
  }

  @Post("webhooks/:id/test")
  @ZodResponse({ status: 201, type: WebhookDeliveryDto })
  test(@Param("id", uuid) id: string) {
    return this.webhooks.sendTest(id)
  }

  @Get("webhooks/:id/deliveries")
  @ZodResponse({ status: 200, type: WebhookDeliveryListDto })
  deliveries(
    @Param("id", uuid) id: string,
    @Query() q: ListWebhookDeliveriesQueryDto
  ) {
    return this.webhooks.deliveries(id, q)
  }

  @Post("webhook-deliveries/:id/resend")
  @ZodResponse({ status: 201, type: WebhookDeliveryDto })
  resend(@Param("id", uuid) id: string) {
    return this.webhooks.resend(id)
  }
}
