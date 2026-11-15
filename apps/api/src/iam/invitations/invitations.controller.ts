import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { createInvitationSchema, invitationSchema } from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { InvitationsService } from "./invitations.service.js"

class InvitationDto extends createZodDto(invitationSchema) {}
class CreateInvitationDto extends createZodDto(createInvitationSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("members")
@Controller({ path: "invitations", version: "1" })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @RequirePermission("member.read")
  @ZodResponse({ status: 200, type: [InvitationDto] })
  list() {
    return this.invitations.listPending()
  }

  @Post()
  @RequirePermission("member.invite")
  @ZodResponse({ status: 201, type: InvitationDto })
  create(@Body() body: CreateInvitationDto) {
    return this.invitations.create(body.email, body.roleId)
  }

  @Post(":id/resend")
  @HttpCode(200)
  @RequirePermission("member.invite")
  @ZodResponse({ status: 200, type: InvitationDto })
  resend(@Param("id", uuid) id: string) {
    return this.invitations.resend(id)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("member.invite")
  cancel(@Param("id", uuid) id: string) {
    return this.invitations.cancel(id)
  }
}
