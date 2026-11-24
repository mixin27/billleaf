import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { WebhooksModule } from "../webhooks/webhooks.module.js"
import { EventsModule } from "../events/events.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { FilesModule } from "../files/files.module.js"
import { PaymentProofsController } from "./payment-proofs.controller.js"
import { PaymentProofsService } from "./payment-proofs.service.js"
import { PaymentsController } from "./payments.controller.js"
import { PaymentsRepository } from "./payments.repository.js"
import { PaymentsService } from "./payments.service.js"

@Module({
  imports: [
    IamModule,
    WebhooksModule,
    EventsModule,
    MailModule,
    PortalLinksModule,
    ClientsModule,
    DocumentsModule,
    InvoicesModule,
    WorkspaceProfileModule,
    FilesModule,
  ],
  controllers: [PaymentsController, PaymentProofsController],
  providers: [PaymentsRepository, PaymentsService, PaymentProofsService],
  exports: [PaymentsService, PaymentProofsService],
})
export class PaymentsModule {}
