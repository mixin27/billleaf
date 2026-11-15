import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { PaymentsController } from "./payments.controller.js"
import { PaymentsRepository } from "./payments.repository.js"
import { PaymentsService } from "./payments.service.js"

@Module({
  imports: [
    IamModule,
    MailModule,
    PortalLinksModule,
    ClientsModule,
    DocumentsModule,
    InvoicesModule,
    WorkspaceProfileModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsRepository, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
