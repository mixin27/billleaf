import { Global, Module } from "@nestjs/common"
import { ClsModule } from "nestjs-cls"

import { RequestContext } from "./request-context.js"

@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true, middleware: { mount: true } })],
  providers: [RequestContext],
  exports: [RequestContext],
})
export class RequestContextModule {}
