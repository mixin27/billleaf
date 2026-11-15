import { Module } from "@nestjs/common"

import { BillingModule } from "./billing/billing.module.js"
import { CoreModule } from "./core/core.module.js"
import { EmailProcessor } from "./jobs/email.processor.js"
import { RecurringProcessor } from "./jobs/recurring.processor.js"
import { RecurringModule } from "./modules/recurring/recurring.module.js"

/** Background worker: same codebase, no HTTP. Register queue processors here. */
@Module({
  imports: [CoreModule, BillingModule, RecurringModule],
  providers: [EmailProcessor, RecurringProcessor],
})
export class WorkerModule {}
