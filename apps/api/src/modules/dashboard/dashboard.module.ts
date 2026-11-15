import { Module } from "@nestjs/common"

import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { DashboardController } from "./dashboard.controller.js"
import { DashboardRepository } from "./dashboard.repository.js"
import { DashboardService } from "./dashboard.service.js"

@Module({
  imports: [WorkspaceProfileModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
