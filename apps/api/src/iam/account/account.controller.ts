import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Session, type UserSession } from "@thallesp/nestjs-better-auth"
import { accountDeletionCheckSchema } from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { AccountService } from "./account.service.js"

class AccountDeletionCheckDto extends createZodDto(
  accountDeletionCheckSchema
) {}

/** The signed-in user's own account (not workspace-scoped). */
@ApiTags("account")
@Controller({ path: "account", version: "1" })
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** What stands in the way of deleting this account. */
  @Get("deletion-check")
  @ZodResponse({ status: 200, type: AccountDeletionCheckDto })
  async deletionCheck(@Session() session: UserSession) {
    return { soleOwnerOf: await this.account.soleOwnerOf(session.user.id) }
  }
}
