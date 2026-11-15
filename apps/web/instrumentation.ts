import * as Sentry from "@sentry/nextjs"
import { SENTRY_DATA_COLLECTION } from "@workspace/env"

/** Server/edge Sentry init (Next.js instrumentation hook). */
export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    dataCollection: SENTRY_DATA_COLLECTION,
  })
}

// Errors from Server Components, route handlers and proxy.ts
export const onRequestError = Sentry.captureRequestError
