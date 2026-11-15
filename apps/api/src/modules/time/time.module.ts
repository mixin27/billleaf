import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { ProjectsModule } from "../projects/projects.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { ClockifyImportService } from "./clockify-import.service.js"
import { TimeReportsController } from "./time-reports.controller.js"
import { TimeReportsService } from "./time-reports.service.js"
import { TimeController } from "./time.controller.js"
import { TimeRepository } from "./time.repository.js"
import { TimeService } from "./time.service.js"

@Module({
  imports: [
    IamModule,
    ClientsModule,
    InvoicesModule,
    ProjectsModule,
    WorkspaceProfileModule,
  ],
  controllers: [TimeController, TimeReportsController],
  providers: [
    TimeRepository,
    TimeService,
    TimeReportsService,
    ClockifyImportService,
  ],
})
export class TimeModule {}
