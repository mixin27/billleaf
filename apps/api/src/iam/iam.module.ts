import { Module } from "@nestjs/common"

import { AuditService } from "./audit/audit.service.js"
import { MeController } from "./me/me.controller.js"
import { MembersController } from "./members/members.controller.js"
import { MembersService } from "./members/members.service.js"
import { PermissionResolver } from "./permissions/permission-resolver.service.js"
import { PermissionSyncService } from "./permissions/permission-sync.service.js"
import { RolesController } from "./roles/roles.controller.js"
import { RolesRepository } from "./roles/roles.repository.js"
import { RolesService } from "./roles/roles.service.js"
import { WorkspaceGuard } from "./workspace.guard.js"
import { WorkspaceBootstrapService } from "./workspaces/workspace-bootstrap.service.js"

@Module({
  controllers: [MeController, RolesController, MembersController],
  providers: [
    AuditService,
    PermissionResolver,
    PermissionSyncService,
    RolesRepository,
    RolesService,
    MembersService,
    WorkspaceBootstrapService,
    WorkspaceGuard,
  ],
  exports: [
    WorkspaceGuard,
    AuditService,
    PermissionResolver,
    WorkspaceBootstrapService,
  ],
})
export class IamModule {}
