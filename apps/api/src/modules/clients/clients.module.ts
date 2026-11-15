import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { ClientsController } from "./clients.controller.js"
import { ClientsRepository } from "./clients.repository.js"
import { ClientsService } from "./clients.service.js"

@Module({
  imports: [IamModule],
  controllers: [ClientsController],
  providers: [ClientsRepository, ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
