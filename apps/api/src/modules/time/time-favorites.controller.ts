import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import {
  createTimeFavoriteSchema,
  reorderTimeFavoritesSchema,
  timeEntrySchema,
  timeFavoriteListSchema,
  timeFavoriteSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequireWorkspace } from "../../common/decorators/require-permission.decorator.js"
import { TimeFavoritesService } from "./time-favorites.service.js"

class FavoriteListDto extends createZodDto(timeFavoriteListSchema) {}
class FavoriteDto extends createZodDto(timeFavoriteSchema) {}
class CreateFavoriteDto extends createZodDto(createTimeFavoriteSchema) {}
class ReorderFavoritesDto extends createZodDto(reorderTimeFavoritesSchema) {}
class TimeEntryDto extends createZodDto(timeEntrySchema) {}

/** Your pinned entries (private to you); the service checks time.track. */
@ApiTags("time")
@RequireWorkspace()
@Controller({ path: "time-favorites", version: "1" })
export class TimeFavoritesController {
  constructor(private readonly favorites: TimeFavoritesService) {}

  @Get()
  @ZodResponse({ status: 200, type: FavoriteListDto })
  async list() {
    return { items: await this.favorites.list() }
  }

  @Post()
  @ZodResponse({ status: 201, type: FavoriteDto })
  create(@Body() body: CreateFavoriteDto) {
    return this.favorites.create(body as never)
  }

  @Put("order")
  @ZodResponse({ status: 200, type: FavoriteListDto })
  async reorder(@Body() body: ReorderFavoritesDto) {
    return { items: await this.favorites.reorder(body.ids) }
  }

  @Post(":id/start")
  @ZodResponse({ status: 201, type: TimeEntryDto })
  start(@Param("id", ParseUUIDPipe) id: string) {
    return this.favorites.start(id)
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.favorites.remove(id)
  }
}
