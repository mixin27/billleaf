import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
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
    MailModule,
    ClientsModule,
    DocumentsModule,
    WorkspaceProfileModule,
  ],
  controllers: [ContractTemplatesController, ContractsController],
  providers: [ContractsRepository, ContractsService],
})
export class ContractsModule {}
