import { Module } from "@nestjs/common"

import { CoreModule } from "./core/core.module.js"
import { EmailProcessor } from "./jobs/email.processor.js"

/** Background worker: same codebase, no HTTP. Register queue processors here. */
@Module({
  imports: [CoreModule],
  providers: [EmailProcessor],
})
export class WorkerModule {}
