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
  createProjectSchema,
  createTaskSchema,
  listProjectsQuerySchema,
  projectListSchema,
  projectSchema,
  taskSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "@workspace/contracts"
import { createZodDto, ZodResponse } from "nestjs-zod"

import { RequirePermission } from "../../common/decorators/require-permission.decorator.js"
import { ProjectsService } from "./projects.service.js"

class ProjectDto extends createZodDto(projectSchema) {}
class ProjectListDto extends createZodDto(projectListSchema) {}
class CreateProjectDto extends createZodDto(createProjectSchema) {}
class UpdateProjectDto extends createZodDto(updateProjectSchema) {}
class ListProjectsQueryDto extends createZodDto(listProjectsQuerySchema) {}
class TaskDto extends createZodDto(taskSchema) {}
class CreateTaskDto extends createZodDto(createTaskSchema) {}
class UpdateTaskDto extends createZodDto(updateTaskSchema) {}

const uuid = new ParseUUIDPipe()

@ApiTags("projects")
@Controller({ path: "projects", version: "1" })
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission("project.read")
  @ZodResponse({ status: 200, type: ProjectListDto })
  list(@Query() query: ListProjectsQueryDto) {
    return this.projects.list(query as never)
  }

  @Get(":id")
  @RequirePermission("project.read")
  @ZodResponse({ status: 200, type: ProjectDto })
  get(@Param("id", uuid) id: string) {
    return this.projects.get(id)
  }

  @Post()
  @RequirePermission("project.create")
  @ZodResponse({ status: 201, type: ProjectDto })
  create(@Body() body: CreateProjectDto) {
    return this.projects.create(body as never)
  }

  @Post("from-quote/:quoteId")
  @RequirePermission("project.create")
  @ZodResponse({ status: 201, type: ProjectDto })
  fromQuote(@Param("quoteId", uuid) quoteId: string) {
    return this.projects.createFromQuote(quoteId)
  }

  @Patch(":id")
  @RequirePermission("project.update")
  @ZodResponse({ status: 200, type: ProjectDto })
  update(@Param("id", uuid) id: string, @Body() body: UpdateProjectDto) {
    return this.projects.update(id, body as never)
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("project.delete")
  remove(@Param("id", uuid) id: string) {
    return this.projects.remove(id)
  }

  @Get(":id/tasks")
  @RequirePermission("project.read")
  @ZodResponse({ status: 200, type: [TaskDto] })
  tasks(@Param("id", uuid) id: string) {
    return this.projects.listTasks(id)
  }

  @Post(":id/tasks")
  @RequirePermission("project.update")
  @ZodResponse({ status: 201, type: TaskDto })
  createTask(@Param("id", uuid) id: string, @Body() body: CreateTaskDto) {
    return this.projects.createTask(id, body as never)
  }

  @Patch(":id/tasks/:taskId")
  @RequirePermission("project.update")
  @ZodResponse({ status: 200, type: TaskDto })
  updateTask(
    @Param("id", uuid) id: string,
    @Param("taskId", uuid) taskId: string,
    @Body() body: UpdateTaskDto
  ) {
    return this.projects.updateTask(id, taskId, body as never)
  }

  @Delete(":id/tasks/:taskId")
  @HttpCode(204)
  @RequirePermission("project.update")
  deleteTask(
    @Param("id", uuid) id: string,
    @Param("taskId", uuid) taskId: string
  ) {
    return this.projects.deleteTask(id, taskId)
  }
}
