import { Module } from "@nestjs/common"

import { IamModule } from "../../iam/iam.module.js"
import { RatesController } from "./rates.controller.js"
import { RatesService } from "./rates.service.js"

@Module({
  imports: [IamModule],
  controllers: [RatesController],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
