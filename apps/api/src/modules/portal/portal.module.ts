import { Module } from "@nestjs/common"

import { BillingModule } from "../../billing/billing.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { ContractsModule } from "../contracts/contracts.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { PaymentsModule } from "../payments/payments.module.js"
import { QuotesModule } from "../quotes/quotes.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { PortalController } from "./portal.controller.js"
import { PortalGuard } from "./portal.guard.js"
import { PortalRepository } from "./portal.repository.js"
import { PortalService } from "./portal.service.js"

@Module({
  imports: [
    BillingModule,
    MailModule,
    QuotesModule,
    InvoicesModule,
    ContractsModule,
    PaymentsModule,
    WorkspaceProfileModule,
  ],
  controllers: [PortalController],
  providers: [PortalRepository, PortalService, PortalGuard],
})
export class PortalModule {}
