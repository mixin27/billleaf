import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { WebhookDeliveryService } from "./webhook-delivery.service.js"
import { WebhooksController } from "./webhooks.controller.js"
import { WebhooksService } from "./webhooks.service.js"

@Module({
  imports: [IamModule, MailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryService],
  exports: [WebhooksService, WebhookDeliveryService],
})
export class WebhooksModule {}
