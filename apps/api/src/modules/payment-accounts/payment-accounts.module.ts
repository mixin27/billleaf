import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { FilesModule } from "../files/files.module.js"
import { PaymentAccountsController } from "./payment-accounts.controller.js"
import { PaymentAccountsService } from "./payment-accounts.service.js"

@Module({
  imports: [IamModule, FilesModule],
  controllers: [PaymentAccountsController],
  providers: [PaymentAccountsService],
  exports: [PaymentAccountsService],
})
export class PaymentAccountsModule {}
