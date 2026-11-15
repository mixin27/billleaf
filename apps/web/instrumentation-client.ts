/**
 * Browser Sentry init (Next.js 16 `instrumentation-client`). Disabled unless
 * NEXT_PUBLIC_SENTRY_DSN is set. No session replay: screens show client and
 * financial data.
 */
import * as Sentry from "@sentry/nextjs"
import { SENTRY_DATA_COLLECTION } from "@workspace/env"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
    ),
    dataCollection: SENTRY_DATA_COLLECTION,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
