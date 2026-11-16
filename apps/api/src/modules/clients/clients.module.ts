import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { WebhooksModule } from "../webhooks/webhooks.module.js"
import { ClientsController } from "./clients.controller.js"
import { ClientsRepository } from "./clients.repository.js"
import { ClientsService } from "./clients.service.js"

@Module({
  imports: [IamModule, WebhooksModule],
  controllers: [ClientsController],
  providers: [ClientsRepository, ClientsService],
  exports: [ClientsService, ClientsRepository],
})
export class ClientsModule {}
