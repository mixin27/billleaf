import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { FilesModule } from "../files/files.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { CashbookAccess } from "./cashbook-access.service.js"
import { CashbookEntriesService } from "./cashbook-entries.service.js"
import { CashbookImportService } from "./cashbook-import.service.js"
import { CashbookReportsService } from "./cashbook-reports.service.js"
import { CashbookController } from "./cashbook.controller.js"
import { CashbookService } from "./cashbook.service.js"

/** Cashbooks: books, per-book members, entries and reports (ADR-0019). */
@Module({
  imports: [IamModule, FilesModule, WorkspaceProfileModule],
  controllers: [CashbookController],
  providers: [
    CashbookAccess,
    CashbookService,
    CashbookEntriesService,
    CashbookReportsService,
    CashbookImportService,
  ],
})
export class CashbookModule {}
