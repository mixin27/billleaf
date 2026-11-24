import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"
import {
  notificationSettingsSchema,
  registerPushDeviceSchema,
  updateNotificationSettingSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { SessionOnly } from "../../common/decorators/require-permission.decorator.js"
import { NotificationsService } from "./notifications.service.js"

class RegisterPushDeviceDto extends createZodDto(registerPushDeviceSchema) {}
class NotificationSettingsDto extends createZodDto(
  notificationSettingsSchema
) {}
class UpdateNotificationSettingDto extends createZodDto(
  updateNotificationSettingSchema
) {}

/** Your phones and your push choices (yours, not the workspace's). */
@ApiTags("notifications")
@SessionOnly()
@Controller({ path: "me", version: "1" })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Register this phone's push token (again after each sign-in). */
  @Post("push-devices")
  @HttpCode(204)
  async registerDevice(
    @Session() session: UserSession,
    @Body() body: RegisterPushDeviceDto
  ) {
    await this.notifications.registerDevice(session.user.id, body)
  }

  /** Stop pushes to this phone (on sign-out). */
  @Delete("push-devices/:token")
  @HttpCode(204)
  async removeDevice(
    @Session() session: UserSession,
    @Param("token") token: string
  ) {
    await this.notifications.removeDevice(session.user.id, token)
  }

  @Get("notification-settings")
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  settings(@Session() session: UserSession) {
    return this.notifications.settings(session.user.id)
  }

  /** Turn one kind of push on or off. */
  @Put("notification-settings")
  @ZodResponse({ status: 200, type: NotificationSettingsDto })
  update(
    @Session() session: UserSession,
    @Body() body: UpdateNotificationSettingDto
  ) {
    return this.notifications.setSetting(
      session.user.id,
      body.type,
      body.enabled
    )
  }
}
