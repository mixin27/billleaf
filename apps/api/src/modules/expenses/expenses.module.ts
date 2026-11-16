import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { FilesModule } from "../files/files.module.js"
import { InvoicesModule } from "../invoices/invoices.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { ExpensesController } from "./expenses.controller.js"
import { ExpensesService } from "./expenses.service.js"
import { ProfitLossService } from "./profit-loss.service.js"

@Module({
  imports: [IamModule, FilesModule, InvoicesModule, WorkspaceProfileModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ProfitLossService],
})
export class ExpensesModule {}
