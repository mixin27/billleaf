import { createEnv, nodeEnvSchema, z } from "@workspace/env"

const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )

export const envSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  API_URL: z.url(),
  WEB_URL: z.url(),
  TRUSTED_ORIGINS: csv,
  /**
   * Platform admins (comma-separated emails). Synced to user.role on boot;
   * removing an email demotes that user. Never granted from the UI.
   */
  PLATFORM_ADMIN_EMAILS: csv,
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  // Optional observability (read directly by src/instrument.ts; listed for docs/validation)
  SENTRY_DSN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  // S3-compatible object storage (SeaweedFS locally, Cloudflare R2 in prod)
  S3_ENDPOINT: z.url().default("http://localhost:8333"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("billleaf-dev"),
  S3_ACCESS_KEY_ID: z.string().default("dev"),
  S3_SECRET_ACCESS_KEY: z.string().default("dev"),
  /** Path-style URLs (required by SeaweedFS/MinIO; R2 works either way). */
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // SaaS billing. "test" is a built-in provider for local development and
  // CI (refused in production). "manual": workspaces pay by bank transfer or
  // mobile wallet and a platform admin approves the proof (ADR-0013).
  BILLING_PROVIDER: z.enum(["test", "manual"]).default("test"),
  /** Shared secret for webhook signatures (min 32 chars outside development). */
  BILLING_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default("dev-only-billing-webhook-secret"),

  /** Enables GET /health/deep when sent as `x-health-token` (unset = disabled). */
  HEALTH_CHECK_TOKEN: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().min(24).optional()),
  /** Build version (git sha), baked into the image; shown by /health/live. */
  APP_VERSION: z.string().default("dev"),

  SMTP_URL: z.string().default("smtp://localhost:1025"),
  EMAIL_FROM: z.string().default("Billleaf <no-reply@billleaf.local>"),
})

export type Env = z.infer<typeof envSchema>

export const ENV = Symbol("ENV")

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return createEnv(envSchema, source)
}
