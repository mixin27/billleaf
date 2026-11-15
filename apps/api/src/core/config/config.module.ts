import { Global, Module } from "@nestjs/common"

import { ENV, loadEnv } from "./env.js"

/** Validates env once at boot and exposes it via the `ENV` token. */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
