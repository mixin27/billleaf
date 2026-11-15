import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { PaymentAccountsModule } from "../payment-accounts/payment-accounts.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { QuotesModule } from "../quotes/quotes.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { InvoicesController } from "./invoices.controller.js"
import { InvoicesRepository } from "./invoices.repository.js"
import { InvoicesService } from "./invoices.service.js"

@Module({
  imports: [
    IamModule,
    MailModule,
    PaymentAccountsModule,
    PortalLinksModule,
    ClientsModule,
    DocumentsModule,
    QuotesModule,
    WorkspaceProfileModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesRepository, InvoicesService],
  exports: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
