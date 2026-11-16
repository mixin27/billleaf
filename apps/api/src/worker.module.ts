import { Module } from "@nestjs/common"

import { BillingModule } from "./billing/billing.module.js"
import { CoreModule } from "./core/core.module.js"
import { BillingProcessor } from "./jobs/billing.processor.js"
import { EmailProcessor } from "./jobs/email.processor.js"
import { RecurringProcessor } from "./jobs/recurring.processor.js"
import { WorkerHeartbeat } from "./jobs/worker-heartbeat.js"
import { ExportProcessor } from "./jobs/export.processor.js"
import { DataExportModule } from "./modules/data-export/data-export.module.js"
import { InvoicesModule } from "./modules/invoices/invoices.module.js"
import { RecurringModule } from "./modules/recurring/recurring.module.js"
import { TimeModule } from "./modules/time/time.module.js"

/** Background worker: same codebase, no HTTP. Register queue processors here. */
@Module({
  imports: [
    CoreModule,
    BillingModule,
    RecurringModule,
    InvoicesModule,
    DataExportModule,
    TimeModule,
  ],
  providers: [
    EmailProcessor,
    RecurringProcessor,
    BillingProcessor,
    ExportProcessor,
    WorkerHeartbeat,
  ],
})
export class WorkerModule {}
