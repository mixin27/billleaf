import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { ProjectsModule } from "../projects/projects.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { TimeController } from "./time.controller.js"
import { TimeRepository } from "./time.repository.js"
import { TimeService } from "./time.service.js"

@Module({
  imports: [IamModule, InvoicesModule, ProjectsModule, WorkspaceProfileModule],
  controllers: [TimeController],
  providers: [TimeRepository, TimeService],
})
export class TimeModule {}
