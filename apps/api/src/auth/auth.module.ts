import { Module } from "@nestjs/common"
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth"

import { ENV, type Env } from "../core/config/env.js"
import { DB, type Database } from "../core/database/database.module.js"
import { IamModule } from "../iam/iam.module.js"
import { WorkspaceBootstrapService } from "../iam/workspaces/workspace-bootstrap.service.js"
import { MailModule } from "../mail/mail.module.js"
import { MailService } from "../mail/mail.service.js"
import { createAuth } from "./auth.js"

/**
 * Mounts Better Auth at /api/auth/* and exposes AuthService/@Session().
 * Guards are registered explicitly in AppModule so their order is fixed:
 * AuthGuard (session) → WorkspaceGuard (tenant + RBAC).
 */
@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      imports: [IamModule, MailModule],
      inject: [ENV, DB, MailService, WorkspaceBootstrapService],
      disableGlobalAuthGuard: true,
      useFactory: (
        env: Env,
        db: Database,
        mail: MailService,
        bootstrap: WorkspaceBootstrapService
      ) => ({
        auth: createAuth({
          env,
          db,
          sendEmail: (m) => mail.send(m),
          onWorkspaceCreated: (ws, member) =>
            bootstrap.onWorkspaceCreated(ws, member),
          onMemberAdded: (ws, member, role) =>
            bootstrap.onMemberAdded(ws, member, role),
          onInvitationAccepted: (ws, member, invitationId) =>
            bootstrap.onInvitationAccepted(ws, member, invitationId),
        }),
      }),
    }),
  ],
})
export class AuthModule {}
