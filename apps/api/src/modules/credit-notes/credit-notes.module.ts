import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { WebhooksModule } from "../webhooks/webhooks.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { CreditNotesController } from "./credit-notes.controller.js"
import { CreditNotesService } from "./credit-notes.service.js"

@Module({
  imports: [
    IamModule,
    MailModule,
    ClientsModule,
    DocumentsModule,
    InvoicesModule,
    PortalLinksModule,
    WebhooksModule,
    WorkspaceProfileModule,
  ],
  controllers: [CreditNotesController],
  providers: [CreditNotesService],
})
export class CreditNotesModule {}
