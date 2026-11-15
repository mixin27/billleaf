import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { QuotesModule } from "../quotes/quotes.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { ProjectsController } from "./projects.controller.js"
import { ProjectsRepository } from "./projects.repository.js"
import { ProjectsService } from "./projects.service.js"

@Module({
  imports: [IamModule, ClientsModule, QuotesModule, WorkspaceProfileModule],
  controllers: [ProjectsController],
  providers: [ProjectsRepository, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
