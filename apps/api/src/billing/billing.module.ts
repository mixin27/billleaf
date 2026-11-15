import { Global, Module } from "@nestjs/common"

import { ENV, type Env } from "../core/config/env.js"
import { IamModule } from "../iam/iam.module.js"
import { MailModule } from "../mail/mail.module.js"
import { BillingController } from "./billing.controller.js"
import { BillingService } from "./billing.service.js"
import { EntitlementsService } from "./entitlements.service.js"
import { ManualBillingController } from "./manual/manual-billing.controller.js"
import { PlatformBillingService } from "./manual/platform-billing.service.js"
import { SubscriptionPaymentsService } from "./manual/subscription-payments.service.js"
import { SubscriptionRemindersService } from "./manual/subscription-reminders.service.js"
import { BILLING_PROVIDER } from "./providers/billing-provider.js"
import { ManualBillingProvider } from "./providers/manual-billing.provider.js"
import { TestBillingProvider } from "./providers/test-billing.provider.js"
import { UsageService } from "./usage.service.js"

/**
 * SaaS billing + plan entitlements. Global so any feature module can inject
 * EntitlementsService. The provider adapter is chosen by BILLING_PROVIDER.
 */
@Global()
@Module({
  imports: [IamModule, MailModule],
  controllers: [BillingController, ManualBillingController],
  providers: [
    EntitlementsService,
    UsageService,
    BillingService,
    PlatformBillingService,
    SubscriptionPaymentsService,
    SubscriptionRemindersService,
    {
      provide: BILLING_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) => {
        switch (env.BILLING_PROVIDER) {
          case "test":
            return new TestBillingProvider(env)
          case "manual":
            return new ManualBillingProvider(env)
        }
      },
    },
  ],
  exports: [
    EntitlementsService,
    UsageService,
    BillingService,
    PlatformBillingService,
    SubscriptionPaymentsService,
    SubscriptionRemindersService,
  ],
})
export class BillingModule {}
