import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { WebhooksModule } from "../webhooks/webhooks.module.js"
import { EventsModule } from "../events/events.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import {
  ContractsController,
  ContractTemplatesController,
} from "./contracts.controller.js"
import { ContractsRepository } from "./contracts.repository.js"
import { ContractsService } from "./contracts.service.js"

@Module({
  imports: [
    IamModule,
    WebhooksModule,
    EventsModule,
    MailModule,
    PortalLinksModule,
    ClientsModule,
    DocumentsModule,
    WorkspaceProfileModule,
  ],
  controllers: [ContractTemplatesController, ContractsController],
  providers: [ContractsRepository, ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
