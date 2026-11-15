import { Module } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { SentryModule } from "@sentry/nestjs/setup"
import { AuthGuard } from "@thallesp/nestjs-better-auth"
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod"

import { AuthModule } from "./auth/auth.module.js"
import { BillingModule } from "./billing/billing.module.js"
import { ProblemDetailsFilter } from "./common/filters/problem-details.filter.js"
import { CoreModule } from "./core/core.module.js"
import { HealthModule } from "./health/health.module.js"
import { IamModule } from "./iam/iam.module.js"
import { WorkspaceGuard } from "./iam/workspace.guard.js"
import { ClientsModule } from "./modules/clients/clients.module.js"
import { DashboardModule } from "./modules/dashboard/dashboard.module.js"
import { InvoicesModule } from "./modules/invoices/invoices.module.js"
import { PaymentsModule } from "./modules/payments/payments.module.js"
import { ProjectsModule } from "./modules/projects/projects.module.js"
import { TimeModule } from "./modules/time/time.module.js"
import { QuotesModule } from "./modules/quotes/quotes.module.js"
import { WorkspaceProfileModule } from "./modules/workspace/workspace-profile.module.js"

@Module({
  imports: [
    SentryModule.forRoot(),
    CoreModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    IamModule,
    BillingModule,
    HealthModule,
    // Business modules
    WorkspaceProfileModule,
    ClientsModule,
    QuotesModule,
    InvoicesModule,
    PaymentsModule,
    ProjectsModule,
    TimeModule,
    DashboardModule,
  ],
  providers: [
    // Guard order matters: rate limit → session → workspace/RBAC.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useExisting: WorkspaceGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
