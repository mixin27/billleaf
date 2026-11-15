import { Module } from "@nestjs/common"

import { BillingModule } from "../billing/billing.module.js"
import { IamModule } from "../iam/iam.module.js"
import { AdminAccessModule } from "./admin-access.module.js"
import { AdminBillingController } from "./admin-billing.controller.js"
import { AdminController } from "./admin.controller.js"
import { AdminService } from "./admin.service.js"

/** Platform admin portal API (/v1/admin). */
@Module({
  imports: [AdminAccessModule, IamModule, BillingModule],
  controllers: [AdminController, AdminBillingController],
  providers: [AdminService],
})
export class AdminModule {}
