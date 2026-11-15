import { Module } from "@nestjs/common"

import { AdminAccessModule } from "../admin/admin-access.module.js"
import { MailModule } from "../mail/mail.module.js"
import { AccountController } from "./account/account.controller.js"
import { AccountService } from "./account/account.service.js"
import { AuditQueryService } from "./audit/audit-query.service.js"
import { AuditController } from "./audit/audit.controller.js"
import { AuditService } from "./audit/audit.service.js"
import { InvitationsController } from "./invitations/invitations.controller.js"
import { InvitationsService } from "./invitations/invitations.service.js"
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
  imports: [MailModule, AdminAccessModule],
  controllers: [
    AccountController,
    AuditController,
    MeController,
    RolesController,
    MembersController,
    InvitationsController,
  ],
  providers: [
    AccountService,
    AuditService,
    AuditQueryService,
    PermissionResolver,
    PermissionSyncService,
    RolesRepository,
    RolesService,
    MembersService,
    InvitationsService,
    WorkspaceBootstrapService,
    WorkspaceGuard,
  ],
  exports: [
    AccountService,
    WorkspaceGuard,
    AuditService,
    AuditQueryService,
    PermissionResolver,
    WorkspaceBootstrapService,
  ],
})
export class IamModule {}
