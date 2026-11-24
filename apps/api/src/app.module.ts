import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core"
import { ThrottlerModule } from "@nestjs/throttler"
import { SentryModule } from "@sentry/nestjs/setup"
import type { Redis } from "ioredis"
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod"

import { AuthModule } from "./auth/auth.module.js"
import { BillingModule } from "./billing/billing.module.js"
import { ProblemDetailsFilter } from "./common/filters/problem-details.filter.js"
import { CoreModule } from "./core/core.module.js"
import { REDIS } from "./core/cache/redis.module.js"
import { ENV, type Env } from "./core/config/env.js"
import { RedisThrottlerStorage } from "./core/cache/redis-throttler.storage.js"
import { HealthModule } from "./health/health.module.js"
import { IamModule } from "./iam/iam.module.js"
import { WorkspaceGuard } from "./iam/workspace.guard.js"
import { ClientsModule } from "./modules/clients/clients.module.js"
import { DashboardModule } from "./modules/dashboard/dashboard.module.js"
import { InvoicesModule } from "./modules/invoices/invoices.module.js"
import { PaymentsModule } from "./modules/payments/payments.module.js"
import { ProjectsModule } from "./modules/projects/projects.module.js"
import { AdminModule } from "./admin/admin.module.js"
import { PaymentAccountsModule } from "./modules/payment-accounts/payment-accounts.module.js"
import { PortalModule } from "./modules/portal/portal.module.js"
import { RatesModule } from "./modules/rates/rates.module.js"
import { TimeModule } from "./modules/time/time.module.js"
import { WebhooksModule } from "./modules/webhooks/webhooks.module.js"
import { NotificationsModule } from "./modules/notifications/notifications.module.js"
import { ExpensesModule } from "./modules/expenses/expenses.module.js"
import { CreditNotesModule } from "./modules/credit-notes/credit-notes.module.js"
import { AppThrottlerGuard } from "./iam/api-keys/api-key-throttler.guard.js"
import { AppAuthGuard } from "./iam/api-keys/app-auth.guard.js"
import { ContractsModule } from "./modules/contracts/contracts.module.js"
import { QuotesModule } from "./modules/quotes/quotes.module.js"
import { RecurringModule } from "./modules/recurring/recurring.module.js"
import { DataExportModule } from "./modules/data-export/data-export.module.js"
import { WorkspaceProfileModule } from "./modules/workspace/workspace-profile.module.js"

@Module({
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    // Counters live in Redis/Valkey so every API instance shares them.
    ThrottlerModule.forRootAsync({
      inject: [REDIS, ENV],
      useFactory: (redis: Redis, env: Env) => ({
        throttlers: [{ ttl: 60_000, limit: env.THROTTLE_LIMIT }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuthModule,
    IamModule,
    BillingModule,
    HealthModule,
    // Business modules
    WorkspaceProfileModule,
    DataExportModule,
    ClientsModule,
    QuotesModule,
    ContractsModule,
    InvoicesModule,
    CreditNotesModule,
    RecurringModule,
    PaymentsModule,
    ExpensesModule,
    ProjectsModule,
    TimeModule,
    RatesModule,
    WebhooksModule,
    NotificationsModule,
    PortalModule,
    PaymentAccountsModule,
    AdminModule,
    DashboardModule,
  ],
  providers: [
    // Guard order matters: rate limit → session → workspace/RBAC.
    // AppAuthGuard: API key (Bearer blk_…) or Better Auth session.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AppAuthGuard },
    { provide: APP_GUARD, useExisting: WorkspaceGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
