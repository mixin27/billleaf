import { Module } from "@nestjs/common"

import { AdminAccessService } from "./admin-access.service.js"
import { PlatformAdminGuard } from "./platform-admin.guard.js"

/** Separate from AdminModule so the auth factory can use it without a cycle. */
@Module({
  providers: [AdminAccessService, PlatformAdminGuard],
  exports: [AdminAccessService, PlatformAdminGuard],
})
export class AdminAccessModule {}
