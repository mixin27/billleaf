import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { ContractsModule } from "../contracts/contracts.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { PaymentsModule } from "../payments/payments.module.js"
import { QuotesModule } from "../quotes/quotes.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { DataExportController } from "./data-export.controller.js"
import { DataExportService } from "./data-export.service.js"

/** Full workspace export with PDFs (queued, built by the worker, emailed). */
@Module({
  imports: [
    IamModule,
    MailModule,
    WorkspaceProfileModule,
    InvoicesModule,
    QuotesModule,
    PaymentsModule,
    ContractsModule,
  ],
  controllers: [DataExportController],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
