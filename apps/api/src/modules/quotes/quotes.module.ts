import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { MailModule } from "../../mail/mail.module.js"
import { PortalLinksModule } from "../portal/portal-links.module.js"
import { ClientsModule } from "../clients/clients.module.js"
import { DocumentsModule } from "../documents/documents.module.js"
import { WorkspaceProfileModule } from "../workspace/workspace-profile.module.js"
import { QuotesController } from "./quotes.controller.js"
import { QuotesRepository } from "./quotes.repository.js"
import { QuotesService } from "./quotes.service.js"

@Module({
  imports: [
    IamModule,
    MailModule,
    PortalLinksModule,
    ClientsModule,
    DocumentsModule,
    WorkspaceProfileModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesRepository, QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
