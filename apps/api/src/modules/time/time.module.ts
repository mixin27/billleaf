import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { ProjectsModule } from "../projects/projects.module.js"
import { RatesModule } from "../rates/rates.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { BudgetsService } from "./budgets.service.js"
import { ClockifyImportService } from "./clockify-import.service.js"
import { ProjectUsageService } from "./project-usage.service.js"
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
    RatesModule,
    MailModule,
    WorkspaceProfileModule,
  ],
  controllers: [TimeController, TimeReportsController],
  providers: [
    TimeRepository,
    TimeService,
    TimeReportsService,
    ClockifyImportService,
    ProjectUsageService,
    BudgetsService,
  ],
  exports: [BudgetsService],
})
export class TimeModule {}
