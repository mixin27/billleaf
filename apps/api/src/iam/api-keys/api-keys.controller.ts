import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  apiKeyListSchema,
  apiKeySchema,
  createApiKeySchema,
  createdApiKeySchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { ApiKeysService } from "./api-keys.service.js"

class ApiKeyDto extends createZodDto(apiKeySchema) {}
class ApiKeyListDto extends createZodDto(apiKeyListSchema) {}
class CreateApiKeyDto extends createZodDto(createApiKeySchema) {}
class CreatedApiKeyDto extends createZodDto(createdApiKeySchema) {}

/** Settings → API keys (Developer API, Pro/Team). */
@ApiTags("api-keys")
@Controller({ path: "api-keys", version: "1" })
@RequirePermission("api_key.manage")
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ZodResponse({ status: 200, type: ApiKeyListDto })
  list() {
    return this.keys.list()
  }

  /** The response is the only time the full key is shown. */
  @Post()
  @ZodResponse({ status: 201, type: CreatedApiKeyDto })
  create(@Body() body: CreateApiKeyDto) {
    return this.keys.create(body)
  }

  @Delete(":id")
  @ZodResponse({ status: 200, type: ApiKeyDto })
  revoke(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.keys.revoke(id)
  }
}
