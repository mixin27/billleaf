import { Module } from "@nestjs/common"

import { NotificationsModule } from "../notifications/notifications.module.js"
import { WebhooksModule } from "../webhooks/webhooks.module.js"
import { DomainEvents } from "./domain-events.service.js"

@Module({
  imports: [WebhooksModule, NotificationsModule],
  providers: [DomainEvents],
  exports: [DomainEvents],
})
export class EventsModule {}
