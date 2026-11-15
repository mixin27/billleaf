import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { RecurringController } from "./recurring.controller.js"
import { RecurringRepository } from "./recurring.repository.js"
import { RecurringService } from "./recurring.service.js"

@Module({
  imports: [IamModule, ClientsModule, InvoicesModule, WorkspaceProfileModule],
  controllers: [RecurringController],
  providers: [RecurringRepository, RecurringService],
  exports: [RecurringService, RecurringRepository],
})
export class RecurringModule {}
