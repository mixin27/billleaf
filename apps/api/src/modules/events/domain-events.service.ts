import { Injectable } from "@nestjs/common"
import type { WebhookEventType } from "@workspace/contracts"

import { NotificationsService } from "../notifications/notifications.service.js"
import { WebhooksService } from "../webhooks/webhooks.service.js"

/**
 * Something happened that the outside should hear about: fans out to the
 * workspace's webhooks and to push notifications on members' phones. Call
 * after the change is committed. Never throws.
 */
@Injectable()
export class DomainEvents {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly notifications: NotificationsService
  ) {}

  async publish(type: WebhookEventType, object: unknown): Promise<void> {
    await this.webhooks.emit(type, object)
    await this.notifications.notify(type, object)
  }
}
