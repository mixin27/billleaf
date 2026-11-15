import { Global, Module } from "@nestjs/common"

import { ENV, type Env } from "../core/config/env.js"
import { IamModule } from "../iam/iam.module.js"
import { BillingController } from "./billing.controller.js"
import { BillingService } from "./billing.service.js"
import { EntitlementsService } from "./entitlements.service.js"
import { BILLING_PROVIDER } from "./providers/billing-provider.js"
import { TestBillingProvider } from "./providers/test-billing.provider.js"
import { UsageService } from "./usage.service.js"

/**
 * SaaS billing + plan entitlements. Global so any feature module can inject
 * EntitlementsService. The provider adapter is chosen by BILLING_PROVIDER.
 */
@Global()
@Module({
  imports: [IamModule],
  controllers: [BillingController],
  providers: [
    EntitlementsService,
    UsageService,
    BillingService,
    {
      provide: BILLING_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        switch (env.BILLING_PROVIDER) {
          case "test":
            return new TestBillingProvider(env)
        }
      },
    },
  ],
  exports: [EntitlementsService, UsageService, BillingService],
})
export class BillingModule {}
