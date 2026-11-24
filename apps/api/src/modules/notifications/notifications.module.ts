import { Module } from "@nestjs/common"

import { ENV, type Env } from "../../core/config/env.js"
import { NotificationsController } from "./notifications.controller.js"
import { NotificationsRepository } from "./notifications.repository.js"
import { NotificationsService } from "./notifications.service.js"
import { PushDeliveryService } from "./push-delivery.service.js"
import {
  ExpoPushProvider,
  LogPushProvider,
  PUSH_PROVIDER,
} from "./push.provider.js"

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    PushDeliveryService,
    {
      provide: PUSH_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.PUSH_PROVIDER === "expo"
          ? new ExpoPushProvider(env.EXPO_ACCESS_TOKEN)
          : new LogPushProvider(),
    },
  ],
  exports: [NotificationsService, PushDeliveryService],
})
export class NotificationsModule {}
