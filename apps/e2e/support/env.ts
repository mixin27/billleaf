import { fileURLToPath } from "node:url"

/**
 * The end-to-end stack: its own ports, database and Valkey index, so it runs
 * next to `pnpm dev` without touching dev data. Shares Postgres, Valkey, S3
 * and Mailpit from `pnpm infra:up` (CI starts the same services).
 */
export const API_PORT = 4100
export const WEB_PORT = 3100
export const API_URL = `http://localhost:${API_PORT}`
export const WEB_URL = `http://localhost:${WEB_PORT}`
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025"

export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://billleaf:billleaf@localhost:5432/billleaf_e2e_test"

/** Environment for the API and worker under test (no .env file is read). */
export const apiEnv: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "warn",
  PORT: String(API_PORT),
  DATABASE_URL,
  // A separate Valkey database: dev workers never pick up e2e jobs.
  REDIS_URL: process.env.E2E_REDIS_URL ?? "redis://localhost:6379/5",
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  API_URL,
  WEB_URL,
  TRUSTED_ORIGINS: "",
  SMTP_URL: process.env.E2E_SMTP_URL ?? "smtp://127.0.0.1:1025",
  EMAIL_FROM: "Billleaf E2E <no-reply@billleaf.test>",
  S3_ENDPOINT: process.env.E2E_S3_ENDPOINT ?? "http://localhost:8333",
  S3_BUCKET: "billleaf-e2e",
  S3_FORCE_PATH_STYLE: "true",
  SENTRY_DSN: "",
  // One browser makes every request from one IP.
  THROTTLE_LIMIT: "100000",
  PDF_FONT_CACHE_DIR: fileURLToPath(
    new URL("../.cache/fonts", import.meta.url)
  ),
}

/** Public env baked into the e2e web build. */
export const webEnv: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_APP_URL: WEB_URL,
}
