import { Module } from "@nestjs/common"

import { PaymentsModule } from "../payments/payments.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { DashboardController } from "./dashboard.controller.js"
import { DashboardRepository } from "./dashboard.repository.js"
import { DashboardService } from "./dashboard.service.js"

@Module({
  imports: [WorkspaceProfileModule, PaymentsModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
