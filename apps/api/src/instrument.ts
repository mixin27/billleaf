/**
 * Sentry (errors + OpenTelemetry-based tracing). Must load before anything
 * else: production starts node with `--import ./dist/instrument.js`, and the
 * entrypoints import it first for dev. Disabled unless SENTRY_DSN is set.
 */
import * as Sentry from "@sentry/nestjs"
import { SENTRY_DATA_COLLECTION } from "@workspace/env"

const dsn = process.env.SENTRY_DSN

if (dsn && !Sentry.isInitialized()) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    // Never send cookies, headers, bodies or query strings: financial data.
    dataCollection: SENTRY_DATA_COLLECTION,
  })
}
